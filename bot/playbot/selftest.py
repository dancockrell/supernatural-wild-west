"""Sabotage the game on purpose and make sure the bot notices.

A silent run only means something if these pass. Each case breaks one thing in
the live page, runs the matching check, and requires a complaint. If a check
stays quiet while its defect is present, that check is decoration and the
report says so.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from . import checks
from .session import GameSession


@dataclass
class Sabotage:
    check: str
    what: str
    apply: Callable[[GameSession], None]
    undo: Callable[[GameSession], None]
    cfg: dict[str, Any]
    # What the new complaint must say. A check that goes red for some other
    # reason has not proved it can see this defect: the sabotage may have
    # tripped something upstream and never reached the branch it was aimed at.
    # An earlier case in this very file did exactly that — it blocked the
    # clicks the check needed, the check skipped, and the run read as a pass.
    # Optional, because the older cases predate it; required for anything new.
    expect_title: str | None = None


def _style(sess: GameSession, css: str) -> None:
    sess.page.evaluate(
        """(css) => { const s = document.createElement('style');
            s.id = 'bot-sabotage'; s.textContent = css; document.head.append(s); }""",
        css,
    )
    sess.page.wait_for_timeout(350)


def _unstyle(sess: GameSession) -> None:
    sess.page.evaluate("() => document.getElementById('bot-sabotage')?.remove()")
    sess.page.wait_for_timeout(350)


def _inflate_head(sess: GameSession) -> None:
    """Make one clip claim to be 200 MB, without writing 200 MB to disk.

    The load check weighs the shipping inventory with HEAD requests, so the
    honest sabotage is at that boundary: a route that rewrites content-length
    on one media response is indistinguishable, from the check's side, from
    somebody re-exporting a clip at its old bitrate. Writing a real 200 MB file
    into public/ would also work and would be a destructive test on a shared
    tree.
    """
    def handler(route: Any) -> None:
        if route.request.method == "HEAD" and route.request.url.endswith("ride.webm"):
            route.fulfill(status=200, headers={"content-length": str(200 * 1024 * 1024),
                                               "content-type": "video/webm"}, body="")
        else:
            route.continue_()
    sess.page.route("**/*.webm", handler)


def _clear_head(sess: GameSession) -> None:
    sess.page.unroute("**/*.webm")


CASES: list[Sabotage] = [
    Sabotage(
        check="offscreen",
        what="shove the spin button off the right edge",
        apply=lambda s: _style(s, "#spin{position:fixed !important;left:120vw !important;top:50vh !important;}"),
        undo=_unstyle,
        cfg={"selectors": ["#spin"]},
    ),
    Sabotage(
        check="overlap",
        what="drag the top bar down onto the title",
        apply=lambda s: _style(s, ".top-actions{position:fixed !important;left:0 !important;top:0 !important;width:60vw !important;height:30vh !important;}"
                                  ".title-area{position:fixed !important;left:0 !important;top:0 !important;width:60vw !important;height:30vh !important;}"),
        undo=_unstyle,
        cfg={"pairs": [[".top-actions", ".title-area"]]},
    ),
    Sabotage(
        check="grounding",
        what="lift both contact shadows well above the boots",
        apply=lambda s: _style(s, ".resident-contact-shadow{top:40% !important;}"),
        undo=_unstyle,
        cfg={"tolerance_px": 18},
    ),
    Sabotage(
        check="seams",
        # The real bug clipped the fog at 38%, but at a 16:9 window the play
        # space and under-controls reach the bottom of the stage, so there is no
        # clean floor at that x for the instrument to read. Clipping at 14% tests
        # the identical mechanism inside the coverage the check actually has,
        # clear of the seams the healthy scene already carries so the new one
        # is not merged into a neighbour by peak suppression.
        what="hard-clip the fog, the mechanism behind the real seam bug",
        apply=lambda s: _style(s, ".unified-parlor .parlor-foreground-fog{-webkit-mask-image:none !important;mask-image:none !important;clip-path:inset(0 0 0 14%) !important;}"),
        undo=_unstyle,
        cfg={"threshold": 6},
    ),
    Sabotage(
        check="tap_targets",
        what="shrink the spin button to a few pixels",
        apply=lambda s: _style(s, "#spin{width:9px !important;height:9px !important;min-height:0 !important;padding:0 !important;}"),
        undo=_unstyle,
        cfg={"min_px": 24, "controls": ["#spin"]},
    ),
    Sabotage(
        check="legibility",
        what="shrink the balance readout to 6px",
        apply=lambda s: _style(s, "#balance{font-size:6px !important;}"),
        undo=_unstyle,
        cfg={"min_px": 11, "targets": ["#balance"]},
    ),
    Sabotage(
        check="label_fit",
        what="blow the spin caption up so it cannot fit its button",
        apply=lambda s: _style(s, "#spin-label{font-size:44px !important;white-space:nowrap !important;}"),
        undo=_unstyle,
        cfg={"tolerance_px": 2, "pairs": [{"label": "#spin-label", "host": "#spin", "states": ["CONNECTING"]}]},
    ),
    Sabotage(
        check="keyboard_play",
        what="swallow Enter on the spin button",
        apply=lambda s: s.page.evaluate(
            "() => { window.__botKeyBlock = e => { if (e.key === 'Enter') { e.stopImmediatePropagation();"
            " e.preventDefault(); } };"
            " document.getElementById('spin').addEventListener('keydown', window.__botKeyBlock, true); }"),
        undo=lambda s: s.page.evaluate(
            "() => document.getElementById('spin').removeEventListener('keydown', window.__botKeyBlock, true)"),
        cfg={},
    ),
    Sabotage(
        check="cutscenes",
        what="leave the shell inert so the game never comes back",
        apply=lambda s: s.page.evaluate(
            "() => { const sh = document.getElementById('shell') || document.querySelector('.shell');"
            " sh.setAttribute('inert',''); window.__botPin = new MutationObserver(() =>"
            " { if (!sh.hasAttribute('inert')) sh.setAttribute('inert',''); });"
            " window.__botPin.observe(sh, {attributes:true}); }"),
        undo=lambda s: s.page.evaluate(
            "() => { window.__botPin && window.__botPin.disconnect();"
            " (document.getElementById('shell') || document.querySelector('.shell')).removeAttribute('inert'); }"),
        cfg={"kinds": ["noon"], "dismiss_ms": 6000},
    ),
    Sabotage(
        check="letterbox",
        what="shrink the stage to a quarter of the window",
        apply=lambda s: _style(s, ".parlor-stage{width:38vw !important;}"),
        undo=_unstyle,
        cfg={"max_waste_pct": 42},
    ),
    Sabotage(
        check="panels",
        what="stop the help dialog from opening",
        apply=lambda s: s.page.evaluate("() => { const b=document.getElementById('help'); const c=b.cloneNode(true); b.replaceWith(c); }"),
        undo=lambda s: s.page.reload(wait_until="load"),
        cfg={"panels": ["help"]},
    ),
    Sabotage(
        check="assets",
        what="point the fog clip at a file that does not exist",
        # /video/bot-does-not-exist.webm is served by Vite as 200 text/html —
        # the SPA fallback — so this also exercises the content-type half of
        # the check, which is the only half that can see a missing media file
        # on this dev server.
        apply=lambda s: s.page.evaluate(
            "() => { const v = document.querySelector('video.parlor-foreground-fog');"
            " if (!v) throw new Error('no fog video to sabotage');"
            " window.__botAssetSrc = v.getAttribute('src');"
            " v.setAttribute('src', '/video/bot-does-not-exist.webm'); v.load(); }"),
        undo=lambda s: s.page.evaluate(
            "() => { const v = document.querySelector('video.parlor-foreground-fog');"
            " if (v && window.__botAssetSrc) { v.setAttribute('src', window.__botAssetSrc); v.load();"
            " void v.play().catch(() => {}); } }"),
        cfg={"settle_ms": 1500, "min_media": 6},
        expect_title="bot-does-not-exist.webm",
    ),
    Sabotage(
        check="resilience",
        # The check's whole point is the branch where recovery is impossible,
        # and that branch has to be reachable on purpose or nobody can prove it
        # works. This brick engages ONLY once the game has gone OFFLINE, which
        # is after the fault has been injected — pinning the spin button
        # disabled from the start would have blocked the very click the check
        # needs and turned the case into a silent skip.
        what="brick recovery once the fault lands, so the game genuinely stays stuck",
        apply=lambda s: s.page.evaluate(
            "() => { window.__botBrick = setInterval(() => {"
            " const conn = document.getElementById('connection');"
            " if (!conn || !/OFFLINE/.test(conn.textContent || '')) return;"
            " const spin = document.getElementById('spin'); if (spin) spin.disabled = true;"
            " const rec = document.getElementById('recover');"
            " if (rec) { rec.hidden = true; rec.disabled = true; } }, 40); }"),
        undo=lambda s: (s.page.evaluate("() => clearInterval(window.__botBrick)"),
                        s.page.reload(wait_until="load"), s.open()),
        cfg={"modes": ["status500"], "settle_ms": 4000, "recover_ms": 5000},
        expect_title="leaves the game unusable",
    ),
    Sabotage(
        check="backgrounding",
        what="pin the room plate paused across the restore",
        # play() is replaced rather than the element paused outright: the check
        # only judges clips that were playing *before* the hide, so a video
        # already stopped when the baseline is taken would be excluded by
        # design and the case would prove nothing. parlor-scene.ts resumes with
        # v.play(), so a no-op play is what a real regression looks like.
        apply=lambda s: s.page.evaluate(
            "() => { window.__botPinVis = () => { if (!document.hidden) return;"
            " const v = document.querySelector('video.parlor-environment:not([hidden])');"
            " if (!v) return; window.__botPinned = v; v.play = () => Promise.resolve(); v.pause(); };"
            " document.addEventListener('visibilitychange', window.__botPinVis); }"),
        undo=lambda s: s.page.evaluate(
            "() => { document.removeEventListener('visibilitychange', window.__botPinVis);"
            " const v = window.__botPinned; if (v) { delete v.play; void v.play().catch(() => {}); } }"),
        cfg={"hidden_ms": 3500, "restore_ms": 2500, "sample_gap_ms": 1200},
        # "environment-color" rather than "environment-color.mp4": the stage
        # holds a day plate and a night plate and swaps which one is unhidden,
        # so pinning "the shown plate" can legitimately pin either. Asserting
        # the day file made this case report WRONG-DEFECT after an earlier case
        # had pushed the game into night — the check was right and the
        # assertion was wrong. No other clip in the game carries this stem.
        expect_title="environment-color",
    ),
    Sabotage(
        check="load",
        what="make one clip claim 200 MB, the size these were before the matte fix",
        apply=_inflate_head,
        undo=_clear_head,
        cfg={"throttle_mbps": 12, "settle_ms": 1200, "inventory": "../docs/runtime-assets.json"},
        expect_title="one asset is",
    ),
]


def run(sess: GameSession) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for case in CASES:
        fn = checks.REGISTRY[case.check]
        # Baseline first: if the check already complains, this case proves nothing.
        try:
            before = fn(sess, case.cfg)
        except Exception as exc:
            results.append({"check": case.check, "verdict": "ERROR-BASELINE", "error": str(exc)})
            continue
        # A "note" means the instrument could not measure, not that it found a
        # defect, so it must not count as catching anything.
        def is_complaint(findings: list) -> list:
            return [f for f in findings if f.severity not in ("praise", "note")]

        baseline = is_complaint(before)

        case.apply(sess)
        try:
            after = fn(sess, case.cfg)
            # Catching means saying something NEW. Counting complaints fails two
            # ways: a game that already has a real bug in that area starts from a
            # non-zero baseline, and a check that caps how many it reports simply
            # displaces an old finding with the new one, holding the count flat.
            was = {f.title for f in baseline}
            fresh = [f for f in is_complaint(after) if f.title not in was]
            caught = bool(fresh)
            # And it has to be the right defect. "Something went red" is the
            # weaker claim, and it is satisfied by a sabotage that tripped an
            # unrelated branch on its way past the one it was aimed at.
            if caught and case.expect_title:
                caught = any(case.expect_title in f.title for f in fresh)
        except Exception as exc:
            caught = False
            after = []
            results.append({"check": case.check, "verdict": "ERROR-SABOTAGED", "error": str(exc)})
        finally:
            case.undo(sess)
            if case.check == "panels":
                sess.open()

        fresh_titles = [f.title for f in is_complaint(after) if f.title not in {b.title for b in baseline}]
        if caught:
            verdict = "OK"
        elif fresh_titles and case.expect_title:
            # It complained, about something else. That is not the same as
            # catching this defect and must not read as a pass.
            verdict = "WRONG-DEFECT"
        else:
            verdict = "BLIND"
        results.append({
            "check": case.check,
            "sabotage": case.what,
            "verdict": verdict,
            "expectedTitleToContain": case.expect_title,
            "newComplaints": [f.title for f in is_complaint(after) if f.title not in {b.title for b in baseline}],
            "complaintsWhenBroken": [f.title for f in is_complaint(after)],
            "complaintsWhenHealthy": [f.title for f in baseline],
        })
    return results
