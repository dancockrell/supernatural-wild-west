"""What the bot looks for.

Each check is an instrument that earned its place by finding something real, or
by being wrong in a way worth remembering. Two rules run through all of them:

1. File a measurement, never an impression.
2. Before blaming a layer, prove it by hiding that layer and re-measuring.
   Several hours went into a seam that three different scans blamed on the
   wrong element; only isolation settled it.
"""
from __future__ import annotations

from typing import Any, Callable

from .complaints import Complaint, praise
from .probes import (column_difference, frames_differ, horizontal_seam, mean_luma,
                     profile_steps, vertical_seam, vertical_seams)
from .session import GameSession

Check = Callable[[GameSession, dict[str, Any]], list[Complaint]]
REGISTRY: dict[str, Check] = {}


def check(name: str) -> Callable[[Check], Check]:
    def wrap(fn: Check) -> Check:
        REGISTRY[name] = fn
        return fn
    return wrap


# --- layout -----------------------------------------------------------------

PLAYABLE = ["#spin", ".controls", ".game", ".player-play-space", "#balance", "#bet", "#help"]


@check("offscreen")
def offscreen(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    """Anything a player needs must be fully on screen at every size."""
    out: list[Complaint] = []
    vw, vh = sess.viewport.width, sess.viewport.height
    for sel, r in sess.rects(cfg.get("selectors", PLAYABLE)).items():
        if not r or r["w"] < 2 or r["h"] < 2:
            continue
        over = {
            "left": round(-r["x"], 1) if r["x"] < -1 else 0,
            "right": round(r["right"] - vw, 1) if r["right"] > vw + 1 else 0,
            "top": round(-r["y"], 1) if r["y"] < -1 else 0,
            "bottom": round(r["bottom"] - vh, 1) if r["bottom"] > vh + 1 else 0,
        }
        if any(over.values()):
            out.append(Complaint(
                check="offscreen", severity="major",
                title=f"{sel} is cut off at {sess.viewport.name}",
                detail=f"I cannot see all of {sel}. It runs past the window edge, so part of it is unreachable.",
                evidence={"overflowPx": over, "rect": r, "viewport": [vw, vh]},
                repro={"viewport": sess.viewport.name, "url": sess.url},
                shot=str(sess.shot(f"offscreen-{sel.strip('#.')}")),
            ))
    if not out:
        out.append(praise("offscreen", f"every control is fully on screen at {sess.viewport.name}",
                          "I checked each thing I need to play and none of it runs past the window edge.",
                          checked=cfg.get("selectors", PLAYABLE), viewport=[vw, vh]))
    return out


@check("overlap")
def overlap(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    """Controls must not sit on top of each other."""
    pairs = cfg.get("pairs") or [
        [".top-actions", ".title-area"],
        [".poker-cards", ".controls"],
        [".player-play-space", ".controls"],
        ["#spin", "#balance"],
    ]
    flat = sorted({s for pair in pairs for s in pair})
    rects = sess.rects(flat)
    out: list[Complaint] = []
    for a, b in pairs:
        ra, rb = rects.get(a), rects.get(b)
        if not ra or not rb or min(ra["w"], rb["w"], ra["h"], rb["h"]) < 2:
            continue
        ox = min(ra["right"], rb["right"]) - max(ra["x"], rb["x"])
        oy = min(ra["bottom"], rb["bottom"]) - max(ra["y"], rb["y"])
        if ox > 1 and oy > 1:
            out.append(Complaint(
                check="overlap", severity="major",
                title=f"{a} overlaps {b} at {sess.viewport.name}",
                detail=f"{a} and {b} are drawn on top of each other by {round(ox)}x{round(oy)}px, so one is obscuring the other.",
                evidence={"overlapPx": [round(ox, 1), round(oy, 1)], a: ra, b: rb},
                repro={"viewport": sess.viewport.name},
                shot=str(sess.shot("overlap")),
            ))
    if not out:
        out.append(praise("overlap", f"no controls collide at {sess.viewport.name}",
                          "Each pair I compared is clear of the other.", pairs=pairs))
    return out


@check("letterbox")
def letterbox(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    """How much of the window the game actually uses."""
    limit = float(cfg.get("max_waste_pct", 42))
    stage = sess.rects([".parlor-stage"]).get(".parlor-stage")
    if not stage:
        return []
    vw, vh = sess.viewport.width, sess.viewport.height
    waste = 100 * (1 - (min(stage["w"], vw) * min(stage["h"], vh)) / (vw * vh))
    if waste > limit:
        return [Complaint(
            check="letterbox", severity="minor",
            title=f"{waste:.0f}% of the window is empty at {sess.viewport.name}",
            detail=("The stage keeps its authored aspect, so a window of a different shape gets bars. "
                    "At this size that is most of the screen and the game feels small."),
            evidence={"wastePct": round(waste, 1), "stage": [round(stage["w"]), round(stage["h"])],
                      "viewport": [vw, vh], "limit": limit},
            repro={"viewport": sess.viewport.name},
            shot=str(sess.shot("letterbox")),
        )]
    return [praise("letterbox", f"the stage uses {100 - waste:.0f}% of the window at {sess.viewport.name}",
                   "Not much of the screen is going to waste at this shape.",
                   wastePct=round(waste, 1), limit=limit)]


@check("tap_targets")
def tap_targets(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    """Controls have to be big enough to actually hit.

    Added after the bot found #paytable rendered 15x3px on a phone: the layout
    sizes everything in cqw, so a letterboxed stage shrinks every control below
    usable size while the geometry still looks correct to a rect check.
    """
    floor = float(cfg.get("min_px", 24))
    controls = cfg.get("controls") or [
        "#spin", "#bet-up", "#bet-down", "#paytable", "#help", "#settings",
        "#audio", "#history", ".quick-mixer summary",
    ]
    out: list[Complaint] = []
    smallest: list[tuple[str, float]] = []
    for sel, r in sess.rects(controls).items():
        if not r or r.get("painted") is False or r["w"] < 1 or r["h"] < 1:
            continue
        least = min(r["w"], r["h"])
        smallest.append((sel, round(least, 1)))
        if least < floor:
            out.append(Complaint(
                check="tap_targets", severity="major",
                title=f"{sel} is only {r['w']:.0f}x{r['h']:.0f}px at {sess.viewport.name}",
                detail=("This control is too small to hit reliably with a finger, and awkward even "
                        "with a mouse. Anything a player must press wants roughly 24px at minimum."),
                evidence={"selector": sel, "size": [round(r["w"], 1), round(r["h"], 1)],
                          "smallestSidePx": least, "floorPx": floor},
                repro={"viewport": sess.viewport.name},
                shot=str(sess.shot(f"tap-{sel.strip('.#')}")),
            ))
    if not out and smallest:
        out.append(praise("tap_targets", f"every control is big enough to press at {sess.viewport.name}",
                          "Nothing a player has to hit is below the size floor.",
                          floorPx=floor, measured=dict(smallest)))
    return out


@check("legibility")
def legibility(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    """Numbers a player relies on must be readable.

    The same cqw collapse that shrank the buttons shrinks their labels, and a
    balance you cannot read is as broken as one that is wrong.
    """
    floor = float(cfg.get("min_px", 11))
    contrast_floor = float(cfg.get("min_contrast", 3.0))
    targets = cfg.get("targets") or ["#balance", "#bet", "#win", "#spin-label",
                                     "#phase", "#round-label", ".poker-award"]
    out: list[Complaint] = []
    readings: dict[str, Any] = {}
    for sel, m in sess.text_metrics(targets).items():
        if not m or not m["text"]:
            continue
        readings[sel] = {"px": m["px"], "contrast": m["contrast"]}
        if m["px"] < floor:
            out.append(Complaint(
                check="legibility", severity="major",
                title=f"{sel} renders at {m['px']:.0f}px at {sess.viewport.name}",
                detail=f"I cannot comfortably read {sel!r} ({m['text']!r}) at this size.",
                evidence={"selector": sel, "fontPx": m["px"], "floorPx": floor, "text": m["text"]},
                repro={"viewport": sess.viewport.name},
                shot=str(sess.shot(f"legibility-{sel.strip('.#')}")),
            ))
        elif m["contrast"] < contrast_floor:
            out.append(Complaint(
                check="legibility", severity="minor",
                title=f"{sel} has {m['contrast']:.1f}:1 contrast at {sess.viewport.name}",
                detail=f"{sel!r} is low contrast against what is behind it, so it is hard to pick out.",
                evidence={"selector": sel, "contrast": m["contrast"], "floor": contrast_floor,
                          "text": m["text"]},
                repro={"viewport": sess.viewport.name},
            ))
    if not out and readings:
        out.append(praise("legibility", f"the numbers are readable at {sess.viewport.name}",
                          "Every figure I rely on while playing is above the size and contrast floor.",
                          floorPx=floor, minContrast=contrast_floor, measured=readings))
    return out


@check("label_fit")
def label_fit(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    """A control's text must fit inside the control, in every state it shows.

    The spin button reads SPIN most of the time and is sized for it, but it
    also says RESOLVING, QUICK STOP, CONNECTING and FREE SPIN. Checking only
    the state that happens to be on screen misses the ones that overflow.
    """
    pairs = cfg.get("pairs") or [{
        "label": "#spin-label", "host": "#spin",
        "states": ["SPIN", "RESOLVING", "QUICK STOP", "CONNECTING", "FREE SPIN · 8"],
    }]
    limit = float(cfg.get("tolerance_px", 2))
    out: list[Complaint] = []
    measured: dict[str, Any] = {}
    for label, worst in sess.label_fit(pairs).items():
        if not worst or worst.get("state") is None:
            continue
        measured[label] = worst
        spill = worst["overflowX"] + worst["overflowY"]
        if spill > limit:
            out.append(Complaint(
                check="label_fit", severity="major",
                title=f"{label} overflows its control by {spill:.0f}px saying {worst['state']!r}",
                detail=("The control is sized for its shortest caption. In this state the text runs "
                        "outside the button, so it is clipped or spills over the art. For a round "
                        "button this is measured against the ring, not the bounding box — text can "
                        "sit inside the box and still break through the circle."),
                evidence={"label": label, "worstState": worst["state"],
                          "overflowPx": [worst["overflowX"], worst["overflowY"]],
                          "labelWidth": worst.get("labelW"), "hostWidth": worst.get("hostW"),
                          "hostShape": worst.get("shape", "rect"),
                          "tolerancePx": limit},
                repro={"viewport": sess.viewport.name, "setText": worst["state"]},
                shot=str(sess.shot(f"label-fit-{label.strip('.#')}")),
            ))
    if not out and measured:
        out.append(praise("label_fit", f"every caption fits its control at {sess.viewport.name}",
                          "I tried each state the button can display and none of them spill out.",
                          measured=measured))
    return out


# --- grounding --------------------------------------------------------------

@check("grounding")
def grounding(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    """Contact shadows must sit under the feet, not on the character.

    The feet position is read from the clip's own alpha every run, because the
    idles rotate and a hardcoded percentage silently rots.
    """
    tol = float(cfg.get("tolerance_px", 18))
    out: list[Complaint] = []
    for host, shadow in (cfg.get("pairs") or {
        ".ghost-porch.left": ".ghost-porch.left .resident-contact-shadow",
        ".ghost-porch.right": ".ghost-porch.right .resident-contact-shadow",
    }).items():
        feet = sess.feet(host)
        rect = sess.rects([shadow]).get(shadow)
        if not feet or not rect or rect["h"] < 2:
            continue
        centre = rect["y"] + rect["h"] / 2
        offset = centre - feet["pageY"]
        if abs(offset) > tol:
            where = "above" if offset < 0 else "below"
            out.append(Complaint(
                check="grounding", severity="major",
                title=f"contact shadow is {abs(offset):.0f}px {where} the feet ({host})",
                detail=("The shadow is not under the character, so they read as floating. "
                        "Feet come from the clip's alpha, so this survives idle rotation."),
                evidence={"offsetPx": round(offset, 1), "feetPageY": round(feet["pageY"], 1),
                          "shadowCentreY": round(centre, 1), "clip": feet["clip"],
                          "feetFracOfClip": round(feet["frac"], 4), "tolerancePx": tol},
                repro={"viewport": sess.viewport.name, "host": host},
                shot=str(sess.shot("grounding")),
            ))
    if not out:
        out.append(praise("grounding", "both maidens are standing on their shadows",
                          "Each contact shadow is centred on the boot line read from the clip's own alpha.",
                          tolerancePx=tol))
    return out


# --- seams ------------------------------------------------------------------

@check("seams")
def seams(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    """Find layers that are drawn with a hard edge.

    Earlier versions hunted for straight lines in a patch of scene believed to
    contain nothing else, and were wrong every time in a new way: they measured
    the edge of a playing card, then missed the real seam because it lay behind
    the controls, then reported the maidens' own boots as a crack in the
    scenery and named the layer holding the maidens as the culprit.

    This version never needs clean scene. For each layer it captures the stage
    with that layer shown and hidden and profiles the per-column difference.
    Anything identical in both frames cancels, so characters, interface and
    painted architecture all drop out, and what remains is only that layer's
    own contribution. A layer clipped with a hard edge produces a step from
    nothing to something exactly at the clip.
    """
    threshold = float(cfg.get("threshold", 6))
    layers = cfg.get("layers") or [
        ".parlor-foreground-fog", ".parlor-light", ".parlor-floor-repair",
        ".parlor-exterior-residents",
    ]
    stage = sess.rects([".parlor-stage"]).get(".parlor-stage")
    if not stage:
        return []
    sess.freeze_media()
    clip = {
        "x": max(0.0, stage["x"]),
        "y": max(0.0, stage["y"]),
        "width": min(stage["w"], sess.viewport.width - max(0.0, stage["x"])),
        "height": min(stage["h"], sess.viewport.height - max(0.0, stage["y"])),
    }
    if clip["width"] < 80 or clip["height"] < 80:
        return []

    out: list[Complaint] = []
    inspected: list[str] = []
    for layer in layers:
        if not sess.rects([layer]).get(layer):
            continue
        inspected.append(layer)
        with_layer = sess.shot_bytes(clip)
        sess.set_layer_visible(layer, False)
        without_layer = sess.shot_bytes(clip)
        sess.set_layer_visible(layer, True)
        profile = column_difference(with_layer, without_layer)
        if not profile or max(profile) < 1.0:
            continue  # layer contributes nothing here; nothing to judge
        for edge in profile_steps(profile, threshold):
            side = "appears" if edge.delta > 0 else "stops"
            out.append(Complaint(
                check="seams", severity="major",
                title=f"{layer} {side} abruptly at x+{edge.pos} (step {abs(edge.delta):.1f})",
                detail=("This layer is drawn with a hard edge rather than fading out, so it lays a "
                        "straight line across the room. Translucent layers want a feathered mask; a "
                        "clip-path or an unfeathered mask cuts them with a razor."),
                evidence={"layer": layer, "edge": edge.as_dict(), "threshold": threshold,
                          "peakContribution": round(max(profile), 2), "cropRect": clip,
                          "method": "per-column difference with the layer shown vs hidden"},
                repro={"viewport": sess.viewport.name, "layer": layer},
                shot=str(sess.shot(f"seam-{layer.strip('.#')}-{edge.pos}", clip)),
            ))
    if not out:
        out.append(praise("seams", f"no layer is cut with a hard edge at {sess.viewport.name}",
                          "For each layer I compared the room with it shown and hidden; every one "
                          "fades rather than stopping at a line.",
                          layersInspected=inspected, threshold=threshold))
    return out


# --- motion -----------------------------------------------------------------

@check("sprite_motion")
def sprite_motion(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    """Sprites must never show a blank or undecoded frame while swapping clips."""
    ms = int(cfg.get("watch_ms", 30000))
    groups = cfg.get("groups") or {
        "leftMaiden": {"host": ".ghost-porch.left"},
        "rightMaiden": {"host": ".ghost-porch.right"},
        "gambler": {"host": ".narrative-gambler"},
    }
    result = sess.watch_sprites(groups, ms)
    stat, samples = result["stat"], result["samples"]
    out: list[Complaint] = []
    for name in groups:
        gaps = stat.get(f"{name}/GAP", 0)
        blanks = stat.get(f"{name}/BLANK", 0)
        held = stat.get(f"{name}/HELD", 0)
        frames = stat.get(f"{name}/frames", 0)
        if gaps or blanks:
            out.append(Complaint(
                check="sprite_motion", severity="major",
                title=f"{name} shows {gaps + blanks} unpainted frames while changing clips",
                detail=("While swapping idles this sprite has frames where nothing can be painted. "
                        "That is the flicker: a clip ends and the next one is not decoded yet, "
                        "with no held frame covering the handoff."),
                evidence={"gapFrames": gaps, "blankFrames": blanks, "heldFrames": held,
                          "framesWatched": frames, "watchMs": ms,
                          "samples": samples.get(f"{name}/GAP") or samples.get(f"{name}/BLANK")},
                repro={"viewport": sess.viewport.name, "group": name},
            ))
    if not out:
        out.append(praise("sprite_motion", "sprite handoffs never showed an unpainted frame",
                          "Across the whole watch every clip change was covered, either by a held frame or by the outgoing clip staying up.",
                          watchMs=ms, perGroup={k: v for k, v in stat.items() if k.endswith(('/HELD', '/GAP', '/BLANK'))}))
    return out


@check("reduced_motion")
def reduced_motion(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    """Reduced motion has to actually stop the room moving."""
    sess.set_reduced_motion(True)
    sess.page.wait_for_timeout(1200)
    first = sess.shot_bytes()
    sess.page.wait_for_timeout(1600)
    second = sess.shot_bytes()
    moved = frames_differ(first, second)
    sess.set_reduced_motion(False)
    limit = float(cfg.get("max_movement", 2.0))
    if moved > limit:
        return [Complaint(
            check="reduced_motion", severity="major",
            title=f"the room still animates with reduced motion on (delta {moved:.1f}/255)",
            detail=("I asked for reduced motion and the scene kept changing between frames. "
                    "Someone who set this preference for motion sensitivity is not getting it."),
            evidence={"frameDelta": round(moved, 2), "limit": limit},
            repro={"viewport": sess.viewport.name, "emulate": "prefers-reduced-motion: reduce"},
            shot=str(sess.shot("reduced-motion")),
        )]
    return [praise("reduced_motion", "reduced motion actually stops the room",
                   "With the preference set the scene held still between frames.",
                   frameDelta=round(moved, 2), limit=limit)]


@check("keyboard_play")
def keyboard_play(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    """The whole game has to be playable without a mouse."""
    out: list[Complaint] = []
    sess.wait_for_spectacle()
    before = sess.state()
    reached = sess.page.evaluate(
        """() => {
            const spin = document.getElementById('spin');
            spin.focus();
            return document.activeElement === spin;
        }"""
    )
    if not reached:
        out.append(Complaint(
            check="keyboard_play", severity="major",
            title="the spin button cannot take keyboard focus",
            detail="I could not focus the main control, so the game cannot be played from a keyboard.",
            evidence={}, repro={"viewport": sess.viewport.name},
        ))
        return out
    sess.page.keyboard.press("Enter")
    sess.page.wait_for_timeout(4200)
    after = sess.state()
    if before.get("round") == after.get("round"):
        out.append(Complaint(
            check="keyboard_play", severity="major",
            title="pressing Enter on the focused spin button did nothing",
            detail=("The button had focus and Enter did not start a round, so a keyboard player "
                    "cannot actually play."),
            evidence={"before": before, "after": after},
            repro={"viewport": sess.viewport.name},
            shot=str(sess.shot("keyboard-enter")),
        ))
    # Focus must be visible, or a keyboard player cannot tell where they are.
    outline = sess.page.evaluate(
        """() => {
            const s = getComputedStyle(document.getElementById('spin'), ':focus-visible');
            const plain = getComputedStyle(document.getElementById('spin'));
            return {outline: s.outlineStyle, width: s.outlineWidth,
                    shadow: s.boxShadow !== plain.boxShadow};
        }"""
    )
    if outline.get("outline") in (None, "none") and not outline.get("shadow"):
        out.append(Complaint(
            check="keyboard_play", severity="minor",
            title="the focused control shows no focus ring",
            detail="Nothing marks which control has keyboard focus, so tabbing through is guesswork.",
            evidence=outline, repro={"viewport": sess.viewport.name},
        ))
    if not out:
        out.append(praise("keyboard_play", f"the game is playable from the keyboard at {sess.viewport.name}",
                          "Spin takes focus, Enter starts a round, and focus is visible."))
    return out


@check("persistence")
def persistence(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    """A reload must not lose or invent credits.

    This game keeps an authoritative session server-side and restores the last
    settled round, so a refresh mid-session is a supported thing a player does.
    """
    sess.wait_for_spectacle()
    before = sess.state()
    if not before.get("balance"):
        return []
    sess.page.reload(wait_until="load")
    sess.open()
    after = sess.state()
    out: list[Complaint] = []
    if before.get("balance") != after.get("balance"):
        out.append(Complaint(
            check="persistence", severity="blocker",
            title=f"balance changed across a reload: {before.get('balance')} -> {after.get('balance')}",
            detail="I refreshed the page and my credits were different afterwards.",
            evidence={"before": before, "after": after},
            repro={"viewport": sess.viewport.name},
            shot=str(sess.shot("persistence-balance")),
        ))
    if before.get("round") != after.get("round"):
        out.append(Complaint(
            check="persistence", severity="major",
            title=f"round counter moved across a reload: {before.get('round')} -> {after.get('round')}",
            detail="Refreshing appears to have advanced or lost a round.",
            evidence={"before": before, "after": after},
            repro={"viewport": sess.viewport.name},
        ))
    if not out:
        out.append(praise("persistence", "a reload restores the same session",
                          "Credits and round survived a refresh unchanged.",
                          balance=after.get("balance"), round=after.get("round")))
    return out


@check("autoplay")
def autoplay(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    """Autoplay must actually run rounds and must stop when told."""
    rounds = int(cfg.get("expect_rounds", 2))
    sess.wait_for_spectacle()
    started = sess.start_autoplay()
    if started != "started":
        return [] if started == "absent" else [Complaint(
            check="autoplay", severity="major",
            title=f"autoplay would not start ({started})",
            detail="I opened autoplay and could not get it running.",
            evidence={"state": started}, repro={"viewport": sess.viewport.name},
            shot=str(sess.shot("autoplay-start")),
        )]
    before = sess.state()
    sess.page.wait_for_timeout(int(cfg.get("watch_ms", 16000)))
    mid = sess.state()
    out: list[Complaint] = []

    def seq(text: str | None) -> int:
        digits = "".join(c for c in (text or "") if c.isdigit())
        return int(digits) if digits else -1

    played = seq(mid.get("round")) - seq(before.get("round"))
    if played < rounds:
        out.append(Complaint(
            check="autoplay", severity="major",
            title=f"autoplay only played {max(played, 0)} rounds when left running",
            detail="I started autoplay and it did not keep playing on its own.",
            evidence={"roundsPlayed": played, "expected": rounds,
                      "before": before.get("round"), "after": mid.get("round")},
            repro={"viewport": sess.viewport.name},
            shot=str(sess.shot("autoplay-stalled")),
        ))
    stopped = sess.stop_autoplay()
    sess.page.wait_for_timeout(6000)
    after_stop = sess.state()
    sess.page.wait_for_timeout(6000)
    later = sess.state()
    if stopped and seq(later.get("round")) != seq(after_stop.get("round")):
        out.append(Complaint(
            check="autoplay", severity="blocker",
            title="autoplay kept spending credits after I stopped it",
            detail="I pressed stop and rounds kept being played.",
            evidence={"atStop": after_stop.get("round"), "later": later.get("round")},
            repro={"viewport": sess.viewport.name},
            shot=str(sess.shot("autoplay-runaway")),
        ))
    if not out:
        out.append(praise("autoplay", "autoplay runs and stops on command",
                          "It played rounds unattended and stopped dead when I pressed stop.",
                          roundsPlayed=played))
    return out


@check("cutscenes")
def cutscenes(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    """Every feature performance must end and give the game back.

    While one plays, the shell is deliberately marked inert so the covered page
    cannot be clicked. That makes a cutscene which fails to close far worse
    than a cosmetic bug: it leaves the whole game unplayable with no error.
    """
    kinds = cfg.get("kinds") or ["ride", "witch", "awaken-0", "fortune", "noon", "brand"]
    limit = int(cfg.get("dismiss_ms", 20000))
    out: list[Complaint] = []
    checked: list[str] = []
    for kind in kinds:
        if not sess.preview_feature(kind):
            # Failing to even start one is itself the symptom worth reporting.
            # While a performance is up the shell is inert, so a game stuck in
            # that state cannot be driven at all — and a check that quietly
            # skipped would have called a bricked game clean.
            state = sess.page.evaluate(
                """() => {
                    const shell = document.getElementById('shell') || document.querySelector('.shell');
                    const spectacle = document.getElementById('spectacle');
                    return {inert: !!(shell && shell.hasAttribute('inert')),
                            showing: spectacle ? !spectacle.hidden : false};
                }"""
            )
            if state["inert"] or state["showing"]:
                out.append(Complaint(
                    check="cutscenes", severity="blocker",
                    title="the game is stuck behind a performance and will not respond",
                    detail=("I could not reach the controls at all. The interface is inert, which is "
                            "what happens while a cutscene plays — so one has not ended."),
                    evidence={"kind": kind, **state},
                    repro={"viewport": sess.viewport.name, "feature": kind},
                    shot=str(sess.shot(f"cutscene-bricked-{kind}")),
                ))
                break
            continue
        appeared = sess.page.evaluate("() => !document.getElementById('spectacle').hidden")
        cleared = sess.wait_for_spectacle(timeout_ms=limit)
        stuck = sess.page.evaluate(
            """() => {
                const shell = document.getElementById('shell') || document.querySelector('.shell');
                const spectacle = document.getElementById('spectacle');
                return {inert: !!(shell && shell.hasAttribute('inert')),
                        showing: spectacle ? !spectacle.hidden : false,
                        spinDisabled: !!document.getElementById('spin')?.disabled};
            }"""
        )
        checked.append(kind)
        if not cleared or stuck["inert"] or stuck["showing"]:
            out.append(Complaint(
                check="cutscenes", severity="blocker",
                title=f"the {kind} performance never gave the game back",
                detail=("The overlay did not finish, and while it is up the whole interface is inert. "
                        "From a player's side the game has simply stopped responding."),
                evidence={"kind": kind, "appeared": appeared, "dismissedWithinMs": limit, **stuck},
                repro={"viewport": sess.viewport.name, "feature": kind},
                shot=str(sess.shot(f"cutscene-stuck-{kind}")),
            ))
            sess.page.reload(wait_until="load")
            sess.open()
        elif stuck["spinDisabled"]:
            sess.page.wait_for_timeout(3000)
            if sess.page.locator("#spin").is_disabled():
                out.append(Complaint(
                    check="cutscenes", severity="major",
                    title=f"spin stayed disabled after the {kind} performance",
                    detail="The cutscene ended but the game did not hand back the spin button.",
                    evidence={"kind": kind, **stuck},
                    repro={"viewport": sess.viewport.name, "feature": kind},
                    shot=str(sess.shot(f"cutscene-nospin-{kind}")),
                ))
    if not out and checked:
        out.append(praise("cutscenes", "every feature performance ends and returns control",
                          "I triggered each one and the overlay cleared, the shell stopped being "
                          "inert, and spin came back.", kinds=checked))
    return out


@check("leaks")
def leaks(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    """Playing for a while must not pile up media elements or memory.

    This game swaps a lot of video. A session that quietly grows a few hundred
    elements plays fine for a minute and badly for an hour, which is exactly
    the kind of thing a person testing by hand never sees.
    """
    spins = int(cfg.get("spins", 6))
    growth_limit = int(cfg.get("max_new_videos", 4))

    def census() -> dict[str, Any]:
        return sess.page.evaluate(
            """() => ({
                videos: document.querySelectorAll('video').length,
                canvases: document.querySelectorAll('canvas').length,
                nodes: document.getElementsByTagName('*').length,
                heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
            })"""
        )

    sess.wait_for_spectacle()
    before = census()
    for _ in range(spins):
        sess.spin()
        sess.wait_for_spectacle()
    after = census()
    grew = {k: (after[k] - before[k]) for k in ("videos", "canvases", "nodes")
            if isinstance(after[k], int) and isinstance(before[k], int)}
    out: list[Complaint] = []
    if grew.get("videos", 0) > growth_limit:
        out.append(Complaint(
            check="leaks", severity="major",
            title=f"{grew['videos']} extra video elements after {spins} spins",
            detail=("Media elements are accumulating as I play. Left running this will chew memory "
                    "and eventually stutter."),
            evidence={"before": before, "after": after, "growth": grew, "spins": spins,
                      "limit": growth_limit},
            repro={"viewport": sess.viewport.name},
        ))
    if not out:
        out.append(praise("leaks", f"nothing piles up over {spins} spins",
                          "Video and canvas counts stayed flat while I played.",
                          before=before, after=after, growth=grew))
    return out


# --- health -----------------------------------------------------------------

@check("health")
def health(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    out: list[Complaint] = []
    if sess.console_errors:
        unique = sorted(set(sess.console_errors))[:8]
        out.append(Complaint(
            check="health", severity="major",
            title=f"{len(sess.console_errors)} console errors while playing",
            detail="The page is logging errors during normal play.",
            evidence={"unique": unique, "total": len(sess.console_errors)},
            repro={"viewport": sess.viewport.name},
        ))
    if sess.failed_requests:
        unique = sorted(set(sess.failed_requests))[:8]
        out.append(Complaint(
            check="health", severity="major",
            title=f"{len(sess.failed_requests)} requests failed",
            detail="Assets the game asked for did not arrive; something will be missing or fall back.",
            evidence={"unique": unique, "total": len(sess.failed_requests)},
            repro={"viewport": sess.viewport.name},
        ))
    if not out:
        out.append(praise("health", "no console errors and no failed requests",
                          "Nothing broke in the background while I played."))
    return out


@check("ledger")
def ledger(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    """Balance must move by exactly (win - stake) across a spin."""
    def money(text: str | None) -> float | None:
        if not text:
            return None
        try:
            return float(text.replace(",", "").strip())
        except ValueError:
            return None

    before = sess.state()
    b0, bet = money(before.get("balance")), money(before.get("bet"))
    if b0 is None or bet is None or (before.get("phase") or "").lower().find("noon") < 0:
        return []
    sess.spin()
    after = sess.state()
    b1, win = money(after.get("balance")), money(after.get("win"))
    if b1 is None or win is None:
        return []
    expected = b0 - bet + win
    drift = b1 - expected
    if abs(drift) > 0.005:
        return [Complaint(
            check="ledger", severity="blocker",
            title=f"balance is off by {drift:+.2f} after a spin",
            detail=("Balance did not move by exactly win minus stake. Either I was charged the wrong "
                    "amount or a win was not paid."),
            evidence={"before": b0, "stake": bet, "win": win, "after": b1,
                      "expected": round(expected, 2), "driftCredits": round(drift, 2)},
            repro={"viewport": sess.viewport.name, "roundBefore": before.get("round"),
                   "roundAfter": after.get("round")},
            shot=str(sess.shot("ledger")),
        )]
    return [praise("ledger", "the balance moved by exactly stake and win",
                   "I played a spin and the credits reconcile to the cent.",
                   before=b0, stake=bet, win=win, after=b1)]


@check("spin_responds")
def spin_responds(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    """Pressing spin has to visibly do something, and give the button back."""
    before_shot = sess.shot_bytes()
    before = sess.state()
    sess.spin()
    after = sess.state()
    moved = frames_differ(before_shot, sess.shot_bytes())
    out: list[Complaint] = []
    if before.get("round") == after.get("round") and moved < 1.0:
        out.append(Complaint(
            check="spin_responds", severity="blocker",
            title="pressing spin changed nothing",
            detail="The round did not advance and the screen did not change. The button looks dead.",
            evidence={"frameDelta": round(moved, 2), "before": before, "after": after},
            repro={"viewport": sess.viewport.name},
            shot=str(sess.shot("dead-spin")),
        ))
    if sess.page.locator("#spin").is_disabled():
        sess.page.wait_for_timeout(6000)
        if sess.page.locator("#spin").is_disabled():
            out.append(Complaint(
                check="spin_responds", severity="blocker",
                title="spin never became available again",
                detail="After a spin the button stayed disabled, so play is stuck.",
                evidence={"state": after},
                repro={"viewport": sess.viewport.name},
                shot=str(sess.shot("stuck-spin")),
            ))
    return out


@check("panels")
def panels(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    """Every panel must open, be readable, and close again."""
    out: list[Complaint] = []
    for which in cfg.get("panels") or ["help", "paytable", "history", "settings"]:
        state = sess.open_panel(which)
        if state == "absent":
            continue
        if state == "unclickable":
            out.append(Complaint(
                check="panels", severity="major",
                title=f"the {which} button cannot be clicked at {sess.viewport.name}",
                detail=("The button is on screen but clicking it does nothing — something is "
                        "covering it or intercepting the press, so this panel is unreachable."),
                evidence={"panel": which, "rect": sess.rects([sess.PANEL_IDS[which]])},
                repro={"viewport": sess.viewport.name},
                shot=str(sess.shot(f"panel-{which}-unclickable")),
            ))
            continue
        visible = sess.page.locator("#modal").is_visible()
        if not visible:
            out.append(Complaint(
                check="panels", severity="major",
                title=f"the {which} panel did not open",
                detail=f"I clicked {which} and no dialog appeared.",
                evidence={"panel": which}, repro={"viewport": sess.viewport.name},
                shot=str(sess.shot(f"panel-{which}")),
            ))
            continue
        body = sess.rects(["#modal"]).get("#modal")
        if body and (body["bottom"] > sess.viewport.height + 2 or body["right"] > sess.viewport.width + 2):
            out.append(Complaint(
                check="panels", severity="minor",
                title=f"the {which} panel runs off screen at {sess.viewport.name}",
                detail="Part of the panel is outside the window, so some of it cannot be read.",
                evidence={"panel": which, "rect": body, "viewport": [sess.viewport.width, sess.viewport.height]},
                repro={"viewport": sess.viewport.name},
                shot=str(sess.shot(f"panel-{which}-overflow")),
            ))
        sess.close_panel()
        if sess.page.locator("#modal").is_visible():
            out.append(Complaint(
                check="panels", severity="major",
                title=f"the {which} panel would not close with Escape",
                detail="Escape left the dialog open, so a keyboard player is trapped in it.",
                evidence={"panel": which}, repro={"viewport": sess.viewport.name},
                shot=str(sess.shot(f"panel-{which}-stuck")),
            ))
            try:
                sess.page.locator("#close-modal").click(timeout=3000)
            except Exception:
                sess.page.reload(wait_until="load")
                sess.open()
            sess.page.wait_for_timeout(300)
    if not out:
        out.append(praise("panels", f"every panel opens, fits and closes at {sess.viewport.name}",
                          "I opened each one, checked it was inside the window, and closed it with Escape.",
                          panels=cfg.get("panels") or ["help", "paytable", "history", "settings"]))
    return out
