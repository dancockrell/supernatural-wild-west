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
        if msg.type in ("error",):
            self.console_errors.append(msg.text)

    def _on_request_failed(self, request: Any) -> None:
        # Aborted media requests are normal when a clip is swapped mid-fetch.
        if request.failure and "ERR_ABORTED" in str(request.failure):
            return
        self.failed_requests.append(f"{request.method} {request.url} :: {request.failure}")

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
