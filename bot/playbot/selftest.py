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
            caught = any(f.title not in was for f in is_complaint(after))
        except Exception as exc:
            caught = False
            after = []
            results.append({"check": case.check, "verdict": "ERROR-SABOTAGED", "error": str(exc)})
        finally:
            case.undo(sess)
            if case.check == "panels":
                sess.open()

        verdict = "OK" if caught else "BLIND"
        results.append({
            "check": case.check,
            "sabotage": case.what,
            "verdict": verdict,
            "newComplaints": [f.title for f in is_complaint(after) if f.title not in {b.title for b in baseline}],
            "complaintsWhenBroken": [f.title for f in is_complaint(after)],
            "complaintsWhenHealthy": [f.title for f in baseline],
        })
    return results
