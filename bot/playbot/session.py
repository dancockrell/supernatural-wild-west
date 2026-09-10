"""Driving the game.

The bot plays through the same controls a person uses. It never calls engine
functions directly, because a bug that only exists in the UI is exactly the
kind this is meant to catch.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from playwright.sync_api import Page, sync_playwright

from . import probes


@dataclass
class Viewport:
    width: int
    height: int
    label: str = ""

    @property
    def name(self) -> str:
        return self.label or f"{self.width}x{self.height}"


class GameSession:
    def __init__(self, url: str, viewport: Viewport, shots_dir: Path, headless: bool = True) -> None:
        self.url = url
        self.viewport = viewport
        self.shots_dir = shots_dir
        self.shots_dir.mkdir(parents=True, exist_ok=True)
        self._headless = headless
        self.console_errors: list[str] = []
        self.failed_requests: list[str] = []
        self.transfers: list[dict[str, Any]] = []
        # Requests that arrived and were refused. `requestfailed` never fires
        # for these — a 404 is a perfectly successful HTTP conversation — so
        # without this list a missing asset leaves no trace in the log at all.
        self.bad_responses: list[dict[str, Any]] = []
        # Faults the bot injected itself. Kept, not discarded — the health
        # check must not report the bot's own sabotage as a game defect, and a
        # silently dropped record would be evidence thrown away rather than
        # accounted for.
        self.injected_failures: list[str] = []
        self._pending_injected: list[str] = []
        self._injected_marks: set[str] = set()
        self._shot_seq = 0

    def __enter__(self) -> "GameSession":
        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(headless=self._headless)
        self._context = self._browser.new_context(
            viewport={"width": self.viewport.width, "height": self.viewport.height}
        )
        self.page: Page = self._context.new_page()
        self.page.on("console", self._on_console)
        self.page.on("requestfailed", self._on_request_failed)
        self.page.on("response", self._on_response)
        self.page.on("pageerror", lambda e: self.console_errors.append(f"pageerror: {e}"))
        return self

    def __exit__(self, *_exc: object) -> None:
        try:
            self._context.close()
            self._browser.close()
        finally:
            self._pw.stop()

    # -- plumbing ----------------------------------------------------------
    def _on_console(self, msg: Any) -> None:
        if msg.type not in ("error",):
            return
        # A fault the bot injected is not a defect in the game. The browser
        # logs "Failed to load resource: ... 500" for the bot's own fulfilled
        # 500, and the first sweep duly filed it under health as a game bug.
        # Kept in a separate list rather than dropped, so the run can still
        # account for every error it saw.
        where = ""
        try:
            where = (msg.location or {}).get("url", "") or ""
        except Exception:
            pass
        if where and any(mark in where for mark in self._injected_marks):
            self.injected_failures.append(f"console: {msg.text} @ {where}")
            return
        self.console_errors.append(msg.text)

    def _on_request_failed(self, request: Any) -> None:
        # Aborted media requests are normal when a clip is swapped mid-fetch.
        if request.failure and "ERR_ABORTED" in str(request.failure):
            return
        if request.url in self._pending_injected:
            self._pending_injected.remove(request.url)
            self.injected_failures.append(f"{request.method} {request.url} :: {request.failure}")
            return
        self.failed_requests.append(f"{request.method} {request.url} :: {request.failure}")

    def _on_response(self, response: Any) -> None:
        try:
            status = response.status
        except Exception:
            return
        headers = response.headers or {}
        if status >= 400:
            self.bad_responses.append({"status": status, "url": response.url,
                                       "type": headers.get("content-type", "")})
        # Size comes from the header rather than from response.body(), which
        # would pull every megabyte of video through this process to weigh it.
        # A response with no content-length is recorded at 0 and counted, so a
        # server that stops sending the header shows up as an implausibly light
        # page rather than as a page that quietly stopped being measured.
        try:
            length = int(headers.get("content-length") or 0)
        except ValueError:
            length = 0
        self.transfers.append({"url": response.url, "status": status,
                               "type": headers.get("content-type", ""),
                               "bytes": length,
                               "sized": "content-length" in headers})

    # -- lifecycle ---------------------------------------------------------
    def open(self) -> None:
        self.page.goto(self.url)
        self.page.wait_for_selector("#spin", timeout=30000)
        # Wait for the room plate itself, not just the DOM: measuring the scene
        # before the background decodes produces confident nonsense.
        try:
            self.page.wait_for_function(
                """() => {
                    const v = document.querySelector('.parlor-environment[src*="environment-color.mp4"]');
                    return !v || v.readyState >= 3;
                }""",
                timeout=25000,
            )
        except Exception:
            pass
        self.page.wait_for_timeout(2500)

    def throttle(self, mbps: float | None, latency_ms: int = 40) -> bool:
        """Emulate a real connection, or clear the emulation with None.

        Without this the load measurement is a measurement of this machine's
        disk: the dev server hands over about 126 MB/s, so the game reported
        itself playable in 555 ms having pulled 70 MB in that window. Both
        numbers were true and neither described anything a player would ever
        experience. Returns False if the emulation could not be installed, so a
        caller can say "not measured" instead of publishing localhost timings
        as though they meant something.
        """
        try:
            cdp = self.page.context.new_cdp_session(self.page)
            cdp.send("Network.enable")
            cdp.send("Network.emulateNetworkConditions", {
                "offline": False,
                "latency": 0 if mbps is None else latency_ms,
                "downloadThroughput": -1 if mbps is None else int(mbps * 1_000_000 / 8),
                "uploadThroughput": -1 if mbps is None else int(mbps * 1_000_000 / 8),
            })
            return True
        except Exception:
            return False

    def measure_load(self, settle_ms: int = 4000) -> dict[str, Any]:
        """Reload cold and weigh what a player waits for.

        Deliberately a fresh navigation with the cache disabled rather than a
        measurement of the already-open page: the interesting number is what
        somebody opening this game for the first time pays, and by the time any
        other check runs, everything is warm.

        Returns the wall time until the spin control is usable, the bytes that
        arrived before that moment, and the single largest response, which is
        the one that actually decides whether a first visit feels broken.
        """
        self._context.clear_cookies()
        try:
            self.page.context.set_extra_http_headers({"Cache-Control": "no-cache"})
        except Exception:
            pass
        self.transfers.clear()
        started = time.monotonic()
        self.page.goto(self.url, wait_until="commit")
        self.page.wait_for_selector("#spin:not([disabled])", timeout=60000)
        playable_ms = int((time.monotonic() - started) * 1000)
        before = list(self.transfers)
        self.page.wait_for_timeout(settle_ms)
        settled = list(self.transfers)
        media = [t for t in settled
                 if t["type"].startswith(("video/", "audio/", "image/"))
                 or t["url"].rsplit(".", 1)[-1].split("?")[0] in ("webm", "mp4", "mp3", "png", "webp")]
        largest = max(media, key=lambda t: t["bytes"], default=None)
        return {
            "playable_ms": playable_ms,
            "responses_before_playable": len(before),
            "bytes_before_playable": sum(t["bytes"] for t in before),
            "responses_total": len(settled),
            "bytes_total": sum(t["bytes"] for t in settled),
            "media_responses": len(media),
            "unsized_responses": sum(1 for t in settled if not t["sized"]),
            "largest_media": largest,
        }

    def resize(self, viewport: Viewport) -> None:
        self.viewport = viewport
        self.page.set_viewport_size({"width": viewport.width, "height": viewport.height})
        self.page.wait_for_timeout(700)

    # -- playing -----------------------------------------------------------
    def spin(self, settle_ms: int = 4200) -> None:
        button = self.page.locator("#spin")
        if button.is_disabled():
            self.page.wait_for_timeout(800)
            if button.is_disabled():
                return
        button.click()
        self.page.wait_for_timeout(settle_ms)

    def nudge_bet(self, up: bool = True) -> bool:
        button = self.page.locator("#bet-up" if up else "#bet-down")
        if button.is_disabled():
            return False
        button.click()
        self.page.wait_for_timeout(250)
        return True

    def start_autoplay(self) -> str:
        """Open the autoplay dialog and start it. Returns started/absent/failed."""
        button = self.page.locator("#autoplay")
        if button.count() == 0 or not button.is_visible():
            return "absent"
        try:
            button.click(timeout=4000)
        except Exception:
            return "failed"
        self.page.wait_for_timeout(600)
        form = self.page.locator("#auto-form button[type=submit]")
        if form.count() == 0:
            return "failed"
        try:
            form.click(timeout=4000)
        except Exception:
            return "failed"
        self.page.wait_for_timeout(1200)
        return "started"

    def stop_autoplay(self) -> bool:
        button = self.page.locator("#autoplay")
        try:
            if "■" in (button.text_content() or "") or "Stop" in (button.get_attribute("aria-label") or ""):
                button.click(timeout=4000)
                self.page.wait_for_timeout(600)
                return True
        except Exception:
            return False
        return False

    def state(self) -> dict[str, Any]:
        return self.page.evaluate(
            """() => ({
                balance: document.getElementById('balance')?.textContent,
                bet: document.getElementById('bet')?.textContent,
                win: document.getElementById('win')?.textContent,
                phase: document.getElementById('phase')?.textContent?.trim(),
                spinLabel: document.getElementById('spin-label')?.textContent,
                round: document.getElementById('round-label')?.textContent,
                connection: document.getElementById('connection')?.textContent?.trim(),
            })"""
        )

    PANEL_IDS = {"settings": "#settings", "help": "#help",
                 "paytable": "#paytable", "history": "#history"}

    def wait_for_spectacle(self, timeout_ms: int = 20000) -> bool:
        """Wait out any full-screen feature performance.

        While one is playing the game deliberately marks the whole shell
        `inert`, so every control legitimately stops accepting clicks. Without
        this wait the bot reported "the help button cannot be clicked" as a
        game bug when the real answer was that it was politely refusing to be
        clicked during a cutscene the bot itself had triggered.
        """
        try:
            self.page.wait_for_function(
                """() => {
                    const s = document.getElementById('spectacle');
                    const shell = document.getElementById('shell') || document.querySelector('.shell');
                    return (!s || s.hidden) && !(shell && shell.hasAttribute('inert'));
                }""",
                timeout=timeout_ms,
            )
            return True
        except Exception:
            return False

    def open_panel(self, which: str, timeout_ms: int = 4000) -> str:
        """Returns 'opened', 'absent', or 'unclickable'.

        A control that cannot be clicked is a finding, not a crash: the first
        version let a 30s Playwright timeout kill the whole check, which threw
        away every other panel result for that viewport.
        """
        self.wait_for_spectacle()
        locator = self.page.locator(self.PANEL_IDS[which])
        if locator.count() == 0 or not locator.is_visible():
            return "absent"
        try:
            locator.click(timeout=timeout_ms)
        except Exception:
            return "unclickable"
        self.page.wait_for_timeout(700)
        return "opened"

    def close_panel(self) -> None:
        self.page.keyboard.press("Escape")
        self.page.wait_for_timeout(400)

    def preview_feature(self, kind: str) -> bool:
        """Trigger a rare performance without wagering, via the in-game gallery."""
        try:
            self.page.locator("#settings").click()
            self.page.wait_for_timeout(400)
            self.page.locator(".developer-tools summary").click()
            self.page.wait_for_timeout(250)
            self.page.locator("#animation-preview").click()
            self.page.wait_for_timeout(600)
            self.page.locator(f'[data-feature-preview="{kind}"]').click()
            self.page.wait_for_timeout(1200)
            return True
        except Exception:
            return False

    def set_reduced_motion(self, on: bool) -> None:
        self.page.emulate_media(reduced_motion="reduce" if on else "no-preference")
        self.page.wait_for_timeout(500)

    # -- observing ---------------------------------------------------------
    def shot(self, tag: str, clip: dict[str, float] | None = None) -> Path:
        self._shot_seq += 1
        path = self.shots_dir / f"{self._shot_seq:03d}-{self.viewport.name}-{tag}.png"
        self.page.screenshot(path=str(path), clip=clip)
        return path

    def shot_bytes(self, clip: dict[str, float] | None = None) -> bytes:
        return self.page.screenshot(clip=clip)

    def rects(self, selectors: list[str]) -> dict[str, Any]:
        return self.page.evaluate(probes.RECTS_JS, selectors)

    def label_fit(self, pairs: list[dict[str, Any]]) -> dict[str, Any]:
        return self.page.evaluate(probes.FIT_JS, pairs)

    def text_metrics(self, selectors: list[str]) -> dict[str, Any]:
        return self.page.evaluate(probes.TEXT_JS, selectors)

    def feet(self, host_selector: str) -> dict[str, Any] | None:
        return self.page.evaluate(probes.FEET_JS, host_selector)

    def watch_sprites(self, groups: dict[str, dict[str, str]], ms: int) -> dict[str, Any]:
        return self.page.evaluate(probes.WATCH_JS, {"groups": groups, "ms": ms})

    def media(self) -> list[dict[str, Any]]:
        return self.page.evaluate(probes.MEDIA_JS)

    def watch_media_errors(self) -> int:
        """Start collecting media `error` events. Returns how many are already held."""
        return self.page.evaluate(probes.MEDIA_WATCH_JS)

    def media_errors(self) -> list[dict[str, Any]]:
        return self.page.evaluate(probes.MEDIA_ERRORS_JS)

    def head(self, urls: list[str]) -> dict[str, Any]:
        """Ask the server whether each URL is really there, from inside the page."""
        if not urls:
            return {}
        return self.page.evaluate(probes.MEDIA_HEAD_JS, urls)

    def playback(self) -> dict[str, Any]:
        return self.page.evaluate(probes.PLAYBACK_JS)

    def set_page_hidden(self, hidden: bool) -> dict[str, Any]:
        """Background or foreground the tab.

        CDP first, because an override the page can see through is a weaker
        test; this Chromium answers `Emulation.setPageVisibilityOverride wasn't
        found`, so the property override is what actually runs. The mechanism
        is returned so a check can say which one it used instead of implying
        one it did not have.
        """
        mechanism = "property-override"
        try:
            if not hasattr(self, "_cdp"):
                self._cdp = self._context.new_cdp_session(self.page)
            self._cdp.send("Emulation.setPageVisibilityOverride",
                           {"visibility": "hidden" if hidden else "visible"})
            mechanism = "cdp"
        except Exception:
            pass
        state = self.page.evaluate(probes.VISIBILITY_JS, hidden)
        return {"mechanism": mechanism, **state}

    def spin_ready(self, timeout_ms: int = 20000) -> bool:
        """Wait until the spin button will actually accept a press."""
        try:
            self.page.wait_for_function(
                """() => {
                    const b = document.getElementById('spin');
                    const s = document.getElementById('spectacle');
                    const shell = document.getElementById('shell') || document.querySelector('.shell');
                    return b && !b.disabled && (!s || s.hidden)
                        && !(shell && shell.hasAttribute('inert'));
                }""",
                timeout=timeout_ms,
            )
            return True
        except Exception:
            return False

    def round_advanced(self, previous: str | None, timeout_ms: int = 15000) -> bool:
        """Did a round actually play?

        Bounded waiting rather than a fixed sleep on purpose: `spin()` gives a
        round 4.2s and a resolving round can take longer than that, so reading
        the label straight afterwards would report a perfectly good spin as a
        silent no-op — a false blocker aimed at somebody else's code.
        """
        if previous is None:
            return False
        try:
            self.page.wait_for_function(
                """(was) => (document.getElementById('round-label')?.textContent || '').trim() !== was""",
                arg=previous, timeout=timeout_ms,
            )
            return True
        except Exception:
            return False

    def fault_route(self, mode: str, delay_ms: int = 14000, path: str = "**/api/spin"):
        """Break one server call on purpose, once.

        Returns a dict whose "fired" counts how many times the fault actually
        ran. A resilience check that cannot say the fault reached the client is
        measuring nothing, so that counter is the denominator, not a detail.
        """
        seen = {"fired": 0, "mode": mode, "path": path}

        def handler(route: Any) -> None:
            if seen["fired"]:
                route.continue_()
                return
            seen["fired"] += 1
            # Mark this exact URL as the bot's doing before serving the fault,
            # so the console error it provokes is attributed to the bot and not
            # to the game.
            self._injected_marks.add(route.request.url)
            try:
                if mode == "status500":
                    route.fulfill(status=500, content_type="application/json",
                                  body='{"error":"bot-injected server fault"}')
                elif mode == "abort":
                    self._pending_injected.append(route.request.url)
                    route.abort("connectionfailed")
                elif mode == "delay":
                    # Hold the reply well past the client's own 12s
                    # AbortSignal.timeout so the timeout path is what runs.
                    time.sleep(delay_ms / 1000)
                    route.continue_()
                else:
                    raise ValueError(f"unknown fault mode {mode!r}")
            except Exception as exc:  # a route that cannot be served is a fault too
                seen["error"] = f"{type(exc).__name__}: {exc}"

        self.page.route(path, handler)
        seen["unroute"] = lambda: self.page.unroute(path, handler)
        return seen

    def hit_test(self, selector: str) -> dict[str, Any] | None:
        """What would actually receive a click aimed at this control's centre?

        A control can be on screen, enabled and unclickable, and the rect says
        nothing about it. `elementFromPoint` names whatever is on top.
        """
        return self.page.evaluate(
            """(sel) => {
                const el = document.querySelector(sel);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                const hit = document.elementFromPoint(cx, cy);
                const describe = (n) => n ? (n.tagName.toLowerCase()
                    + (n.id ? '#' + n.id : '')
                    + (typeof n.className === 'string' && n.className
                        ? '.' + n.className.trim().split(/\\s+/).join('.') : '')) : null;
                return {
                    rect: {x: Math.round(r.x), y: Math.round(r.y),
                           w: Math.round(r.width), h: Math.round(r.height)},
                    centre: [Math.round(cx), Math.round(cy)],
                    insideViewport: cx >= 0 && cy >= 0
                        && cx <= innerWidth && cy <= innerHeight,
                    topmost: describe(hit),
                    isSelfOrChild: !!(hit && (hit === el || el.contains(hit) || hit.contains(el))),
                    pointerEvents: getComputedStyle(el).pointerEvents,
                    inertAncestor: !!el.closest('[inert]'),
                };
            }""",
            selector,
        )

    def status_line(self) -> dict[str, Any]:
        """What the game is telling the player right now, and how readably."""
        return self.page.evaluate(
            """() => {
                const s = document.getElementById('status');
                const rec = document.getElementById('recover');
                const spin = document.getElementById('spin');
                const box = s ? s.getBoundingClientRect() : null;
                const cs = s ? getComputedStyle(s) : null;
                return {
                    text: s ? (s.textContent || '').trim() : null,
                    role: s ? s.getAttribute('role') : null,
                    fontPx: cs ? parseFloat(cs.fontSize) : null,
                    visible: !!(s && cs && cs.display !== 'none' && cs.visibility !== 'hidden'
                        && parseFloat(cs.opacity || '1') > 0.05 && box.width > 4 && box.height > 4),
                    recoverVisible: !!(rec && !rec.hidden && rec.getBoundingClientRect().width > 4),
                    recoverDisabled: rec ? !!rec.disabled : null,
                    spinDisabled: spin ? !!spin.disabled : null,
                    spinLabel: document.getElementById('spin-label')?.textContent?.trim() || null,
                    connection: document.getElementById('connection')?.textContent?.trim() || null,
                    round: document.getElementById('round-label')?.textContent?.trim() || null,
                };
            }"""
        )

    def freeze_media(self) -> None:
        """Pause every clip so successive captures are comparable."""
        self.page.evaluate("() => document.querySelectorAll('video').forEach(v => v.pause())")
        self.page.wait_for_timeout(250)

    def set_layer_visible(self, selector: str, visible: bool) -> None:
        self.page.evaluate(
            "({selector, visible}) => document.querySelectorAll(selector)"
            ".forEach(e => e.style.visibility = visible ? '' : 'hidden')",
            {"selector": selector, "visible": visible},
        )
        self.page.wait_for_timeout(220)
