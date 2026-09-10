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


def undetermined(check_name: str, title: str, detail: str, repro: dict[str, Any] | None = None,
                 **evidence: Any) -> Complaint:
    """"I could not determine this", said out loud.

    A check has to be able to say three things, not two. Folding "could not
    measure" into either "clean" or "broken" is where the lie enters, and the
    selftest deliberately refuses to let a note count as catching anything —
    so a note can never be mistaken for a pass.
    """
    return Complaint(check=check_name, severity="note", title=title,
                     detail=detail + " Treat this as unknown, not clean.",
                     evidence=evidence, repro=repro or {})


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


# --- load -------------------------------------------------------------------


def _inventory_sizes(sess: GameSession, cfg: dict[str, Any]) -> dict[str, Any] | None:
    """The largest media file the server would hand over, from the manifest.

    Returns None rather than a zero when it cannot establish this, because a
    missing manifest and a game with no large files produce the same number and
    only one of them is good news.
    """
    import json as _json
    from pathlib import Path as _Path
    path = _Path(cfg.get("inventory", "../docs/runtime-assets.json"))
    try:
        listed = _json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    media = [p for p in listed if p.rsplit(".", 1)[-1].lower() in ("webm", "mp4", "mp3", "png", "webp")]
    if len(media) < int(cfg.get("min_inventory", 40)):
        return None
    sizes = sess.head(media)
    weighed = [{"url": u, "bytes": int(r.get("length") or 0)}
               for u, r in sizes.items() if r.get("status") == 200 and r.get("length")]
    if len(weighed) < int(cfg.get("min_inventory", 40)):
        return None
    best = max(weighed, key=lambda r: r["bytes"])
    best["weighed"] = len(weighed)
    best["listed"] = len(media)
    return best


@check("load")
def load(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    """What a first visit costs, and the one number that guards it.

    This check exists because of what was found on 11 Sep 2026: the clips carry
    alpha, and the colour plane under their transparent pixels was random
    per-frame noise. Invisible, uncompressible, and most of the bitrate. One
    nine-second performance was 95 MB. Cleaning the matte took 43 clips from
    1,430.6 MB to 294.5 MB with no change to any dimension.

    Nothing stopped that coming back. A single re-exported clip dropped into
    public/video would restore it silently, because everything still plays -
    it just plays after a wait nobody measures. So the durable guard here is
    `max_single_asset_mb`: not the page weight, which drifts for a dozen
    innocent reasons, but the largest single response, which is what actually
    decides whether the game feels broken on a real connection.

    Measured cold, with the cache cleared, because by the time any other check
    runs everything is warm and the number is meaningless.
    """
    budget_ms = int(cfg.get("max_playable_ms", 15000))
    budget_mb = float(cfg.get("max_mb_before_playable", 60))
    single_mb = float(cfg.get("max_single_asset_mb", 30))
    floor = int(cfg.get("min_responses", 10))

    mbps = cfg.get("throttle_mbps", 12)
    throttled = sess.throttle(mbps) if mbps else False
    try:
        stats = sess.measure_load(settle_ms=int(cfg.get("settle_ms", 4000)))
    finally:
        if throttled:
            sess.throttle(None)
    stats["throttle_mbps"] = mbps if throttled else None
    mb = lambda n: round(n / (1024 * 1024), 2)
    out: list[Complaint] = []

    # Count the fragile thing. If almost nothing was observed, the instrument
    # broke - a page that genuinely served ten responses and a listener that
    # stopped firing look identical in the totals.
    if stats["responses_total"] < floor:
        return [undetermined(
            "load", "I could not weigh the first visit",
            f"Only {stats['responses_total']} responses were seen, below the floor of {floor}. "
            "Either the page did not load or the response listener is not firing; "
            "either way these numbers say nothing about the game.",
            repro={"viewport": sess.viewport.name}, stats=stats)]

    # The largest asset must NOT be read from what the browser happened to
    # fetch. Under emulation only 1.24 MB arrives before the game is playable,
    # so "largest response seen" would report a small number for a game
    # carrying a 95 MB clip that simply had not been reached yet - a guard that
    # passes because it never looked. Ask the server instead, over the whole
    # shipping inventory, which tests/browser/runtime-assets.spec.ts pins to
    # exactly what public/ serves.
    inventory = _inventory_sizes(sess, cfg)
    if inventory is None:
        out.append(undetermined(
            "load", "I could not weigh the shipping inventory",
            f"{cfg.get('inventory', '../docs/runtime-assets.json')} could not be read or returned too "
            "few sized media paths, so the largest-asset budget was not applied. The load timings "
            "below stand; the size guard did not run.",
            repro={"viewport": sess.viewport.name}, stats=stats))
        largest = None
    else:
        largest = inventory
        stats["largest_shipped"] = largest
    if largest and largest["bytes"] > single_mb * 1024 * 1024:
        out.append(Complaint(
            check="load", severity="major",
            title=f"one asset is {mb(largest['bytes'])} MB",
            detail=(f"{largest['url'].rsplit('/', 1)[-1]} alone is {mb(largest['bytes'])} MB, over the "
                    f"{single_mb} MB budget. A clip this size holds its own performance behind a poster "
                    "on any connection a player is likely to have. If it carries alpha, check whether the "
                    "colour plane under its transparent pixels is noise: run "
                    "`node scripts/reencode-video.mjs --matte --keep-size --only=<path>`, which refuses "
                    "anything that would change how the clip looks."),
            evidence={"asset": largest, "budget_mb": single_mb},
            repro={"viewport": sess.viewport.name},
        ))

    if mbps and not throttled:
        out.append(undetermined(
            "load", "I could not measure the load time honestly",
            "Network emulation would not install, so the only timing available is this machine's "
            "local disk speed. The byte counts below are still true; the milliseconds are not a "
            "claim about any player's connection.",
            repro={"viewport": sess.viewport.name}, stats=stats))
    elif stats["playable_ms"] > budget_ms:
        out.append(Complaint(
            check="load", severity="major",
            title=f"{stats['playable_ms']} ms before the game could be played",
            detail=(f"The spin control did not become usable for {stats['playable_ms']} ms on a cold load, "
                    f"past the {budget_ms} ms budget. {stats['responses_before_playable']} responses and "
                    f"{mb(stats['bytes_before_playable'])} MB arrived in that time."),
            evidence=stats, repro={"viewport": sess.viewport.name},
        ))

    if stats["bytes_before_playable"] > budget_mb * 1024 * 1024:
        out.append(Complaint(
            check="load", severity="minor",
            title=f"{mb(stats['bytes_before_playable'])} MB before the first spin is possible",
            detail=(f"A cold visit pulls {mb(stats['bytes_before_playable'])} MB before the game is playable, "
                    f"over the {budget_mb} MB budget. Media that is not on screen yet can wait."),
            evidence=stats, repro={"viewport": sess.viewport.name},
        ))

    if not out:
        out.append(praise(
            "load",
            f"playable in {stats['playable_ms']} ms, {mb(stats['bytes_before_playable'])} MB",
            (f"Cold load: {stats['responses_total']} responses, {mb(stats['bytes_total'])} MB in total, "
             f"largest single asset {mb(largest['bytes']) if largest else 0} MB."),
            **stats))
    return out


# --- assets -----------------------------------------------------------------

_IMAGE_TYPES = ("image/",)
_VIDEO_TYPES = ("video/", "audio/", "application/octet-stream")


@check("assets")
def assets(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    """Every media element the page actually mounts has to load.

    Three independent instruments, because each one is blind to something:

    * the DOM (`readyState`, `naturalWidth`, `video.error`) says whether the
      browser could decode what it was given;
    * `error` events caught at window in the capture phase say so even for a
      clip that failed and was then swapped away, which the DOM no longer
      remembers;
    * a HEAD request per referenced URL says whether the file is there at all.

    The HEAD half needs the content type, not just the status, and that is not
    a nicety. Measured on this dev server: `GET /video/bot-does-not-exist.webm`
    answers **200** with `Content-Type: text/html`, because Vite falls back to
    the SPA index for anything it cannot find. A status-only check would have
    called every missing clip in the game healthy.
    """
    settle_ms = int(cfg.get("settle_ms", 2500))
    floor = int(cfg.get("min_media", 6))
    verify_paths = cfg.get("verify_paths", True)

    sess.wait_for_spectacle()
    sess.watch_media_errors()
    first = sess.media()
    sess.page.wait_for_timeout(settle_ms)
    second = sess.media()

    def key(rec: dict[str, Any]) -> tuple[str, str, str]:
        return (rec["tag"], rec.get("cls") or "", rec.get("src") or "")

    earlier = {key(r): r for r in first}
    out: list[Complaint] = []
    examined = 0

    for rec in second:
        if not rec["mounted"] or not rec["hasSrc"]:
            continue
        examined += 1
        was = earlier.get(key(rec))
        name = rec.get("file") or rec.get("src") or "?"
        where = "on screen" if rec["painted"] else "preloaded off screen"

        if rec["tag"] == "IMG":
            # naturalWidth 0 on a *complete* image means the bytes arrived and
            # decoded to nothing. An incomplete image is still in flight and is
            # not a finding.
            if rec.get("complete") and rec.get("naturalWidth") == 0:
                out.append(Complaint(
                    check="assets", severity="blocker" if rec["painted"] else "major",
                    title=f"<img> {name} finished loading with no pixels in it",
                    detail=("This image reports itself complete and decoded to nothing, so there is a "
                            "hole where it should be painting."),
                    evidence={"file": name, "src": rec["src"], "naturalWidth": 0,
                              "complete": True, "cssClass": rec["cls"], "elementSize": rec["size"],
                              "painted": rec["painted"]},
                    repro={"viewport": sess.viewport.name},
                    shot=str(sess.shot("assets-img-empty")),
                ))
            continue

        if rec["tag"] != "VIDEO":
            continue  # a <source> is judged through the <video> that owns it

        if rec.get("errorCode") is not None:
            out.append(Complaint(
                check="assets", severity="blocker" if rec["painted"] else "major",
                title=f"<video> {name} failed with media error {rec['errorCode']}",
                detail=(f"This clip is mounted {where} and the browser could not use it. A poster is a "
                        "legitimate fallback while a clip loads; a clip that errors never decodes at all."),
                evidence={"file": name, "src": rec["src"], "mediaErrorCode": rec["errorCode"],
                          "mediaErrorMessage": rec.get("errorMessage"),
                          "readyState": rec.get("readyState"), "networkState": rec.get("networkState"),
                          "hasPoster": rec.get("hasPoster"), "painted": rec["painted"],
                          "cssClass": rec["cls"]},
                repro={"viewport": sess.viewport.name, "selector": f"video[src$='{name}']"},
                shot=str(sess.shot("assets-video-error")),
            ))
            continue

        # readyState 0 is HAVE_NOTHING. One sample of that is ordinary — a clip
        # mounted a moment ago has not loaded yet. Two samples settle_ms apart
        # is a clip that is never going to arrive.
        if rec.get("readyState") == 0 and was is not None and was.get("readyState") == 0:
            out.append(Complaint(
                check="assets", severity="blocker" if rec["painted"] else "major",
                title=f"<video> {name} never got past readyState 0",
                detail=(f"Mounted {where} and still holding nothing after {settle_ms}ms. Nothing can "
                        "decode from it, so either the poster is standing in permanently or the "
                        "element is empty."),
                evidence={"file": name, "src": rec["src"], "readyStateBoth": 0,
                          "settleMs": settle_ms, "networkState": rec.get("networkState"),
                          "hasPoster": rec.get("hasPoster"), "painted": rec["painted"],
                          "cssClass": rec["cls"]},
                repro={"viewport": sess.viewport.name},
                shot=str(sess.shot("assets-video-stalled")),
            ))

    # -- the file really being there ----------------------------------------
    urls = sorted({r["src"] for r in second
                   if r["mounted"] and r["hasSrc"] and r["src"].startswith("http")})
    kind = {r["src"]: r["tag"] for r in second if r.get("src")}
    verified = 0
    head: dict[str, Any] = {}
    if verify_paths and urls:
        head = sess.head(urls)
        for url, res in head.items():
            if res.get("status") is None:
                continue  # the request itself failed; counted as unverified below
            verified += 1
            ctype = (res.get("type") or "").lower()
            wanted = _IMAGE_TYPES if kind.get(url) == "IMG" else _VIDEO_TYPES
            bad_status = res["status"] >= 400
            wrong_type = not any(ctype.startswith(w) for w in wanted)
            if not (bad_status or wrong_type):
                continue
            short = url.split("?")[0].split("/")[-2:]
            out.append(Complaint(
                check="assets", severity="major",
                title=f"{'/'.join(short)} is referenced but not on the server",
                detail=("A media element points at this path and the server does not have it. "
                        "The dev server answers a missing file with 200 and the SPA index.html, so "
                        "the content type is what gives it away — a clip served as text/html is a "
                        "clip that does not exist."),
                evidence={"url": url, "status": res["status"], "contentType": res.get("type"),
                          "contentLength": res.get("length"), "element": kind.get(url),
                          "expectedTypePrefixes": list(wanted)},
                repro={"viewport": sess.viewport.name,
                       "command": f"curl -sI {url}"},
            ))

    unverifiable = [u for u, r in head.items() if r.get("status") is None]
    if unverifiable:
        out.append(undetermined(
            "assets", f"{len(unverifiable)} media URLs could not be checked against the server",
            "The HEAD request for these did not complete, so I do not know whether the files exist.",
            repro={"viewport": sess.viewport.name},
            urls=unverifiable[:8], errors={u: head[u].get("error") for u in unverifiable[:8]}))

    # -- error events, including for clips already swapped away -------------
    events = sess.media_errors()
    if events:
        out.append(Complaint(
            check="assets", severity="major",
            title=f"{len(events)} media elements fired an error event while I played",
            detail=("Some of these may have been swapped away since, which is exactly why the DOM no "
                    "longer shows them. They still failed."),
            evidence={"events": events[:10], "total": len(events)},
            repro={"viewport": sess.viewport.name},
        ))

    media_responses = [r for r in sess.bad_responses
                       if any(s in r["url"] for s in cfg.get("media_paths", ["/video/", "/art/", "/audio/", "/fonts/"]))]
    if media_responses:
        out.append(Complaint(
            check="assets", severity="major",
            title=f"{len(media_responses)} media requests were refused by the server",
            detail="These arrived as real HTTP failures, so whatever asked for them got nothing.",
            evidence={"responses": media_responses[:10], "total": len(media_responses)},
            repro={"viewport": sess.viewport.name},
        ))

    # -- the denominator ----------------------------------------------------
    if examined < floor:
        return out + [undetermined(
            "assets", f"only {examined} mounted media elements were examined",
            f"That is below the floor of {floor}, which means the probe found almost nothing to look "
            "at. An empty census and a healthy game produce the same silence, so this run proves "
            "nothing about the game's assets.",
            repro={"viewport": sess.viewport.name},
            mediaExamined=examined, floor=floor, urlsVerified=verified,
            sampleOfWhatWasSeen=[r.get("file") for r in second[:6]])]

    if not out:
        out.append(praise("assets", f"all {examined} mounted media elements loaded at {sess.viewport.name}",
                          "Every img and video the page has mounted has real pixels or a decoded "
                          "stream, none fired an error, and every referenced file answered the "
                          "server with a media content type.",
                          mediaExamined=examined, urlsVerified=verified,
                          videosPainted=sum(1 for r in second if r["tag"] == "VIDEO" and r["painted"]),
                          settleMs=settle_ms))
    return out


# --- resilience -------------------------------------------------------------

@check("resilience")
def resilience(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    """The client has to stay usable when the server misbehaves.

    Three faults, injected one at a time into /api/spin: a 500, a network
    abort, and a reply held past the client's own 12s AbortSignal. After each
    one the game must (a) tell the player something they can read and (b) let
    them play again. A game left with a permanently disabled spin button is
    bricked and gets a blocker; one that recovers but says nothing gets a
    major, because from the player's side a spin that silently did nothing is
    indistinguishable from a stolen stake.

    The fault counter is the denominator and it is not optional. If the route
    never fired, this check has proved nothing and says so — a version that
    assumed the click landed would report a healthy game whenever the spin
    button happened to be busy.
    """
    modes = cfg.get("modes") or ["status500", "abort", "delay"]
    delay_ms = int(cfg.get("delay_ms", 14000))
    settle_ms = int(cfg.get("settle_ms", 5000))
    recover_ms = int(cfg.get("recover_ms", 9000))
    min_font = float(cfg.get("min_message_px", 10))
    # The seam that makes the "fault never fired" branch reachable on purpose:
    # aim it at a route the game never calls and the check must report
    # undetermined rather than praise. A branch nobody can trigger is a branch
    # nobody can prove they fixed.
    fault_path = cfg.get("fault_path", "**/api/spin")
    out: list[Complaint] = []
    exercised: list[str] = []
    log: dict[str, Any] = {}

    for mode in modes:
        sess.wait_for_spectacle()
        if not sess.spin_ready(int(cfg.get("ready_ms", 25000))):
            out.append(undetermined(
                "resilience", f"could not press spin, so the {mode} fault was never injected",
                "The spin button never became pressable, so the game was not put under this fault at all.",
                repro={"viewport": sess.viewport.name},
                mode=mode, state=sess.status_line()))
            continue
        before = sess.status_line()
        fault = sess.fault_route(mode, delay_ms, fault_path)
        try:
            # A click that reports a timeout has not necessarily failed to
            # press: the first press can register and the retry loop then time
            # out against a button the press itself disabled. An earlier version
            # bailed out here saying "the fault never reached the client" while
            # the 500 had already landed — a false claim, and it left the game
            # offline for every check that ran afterwards. The fault counter is
            # what decides, not the click.
            click_error = None
            try:
                sess.page.locator("#spin").click(timeout=6000)
            except Exception as exc:
                click_error = f"{type(exc).__name__}: {str(exc)[:160]}"
            sess.page.wait_for_timeout(settle_ms + (delay_ms if mode == "delay" else 0))
            if not fault["fired"]:
                out.append(undetermined(
                    "resilience", f"the injected {mode} fault never reached the client",
                    f"The route was armed and {fault['path']} was never called through it, so nothing "
                    "about the game's behaviour under this fault was measured.",
                    repro={"viewport": sess.viewport.name},
                    mode=mode, route=fault["path"], faultError=fault.get("error"),
                    clickError=click_error, state=sess.status_line()))
                continue
            exercised.append(mode)
            after = sess.status_line()

            # Did the game say anything a player can actually read?
            said = (after["text"] or "").strip()
            spoke = bool(said) and said != (before["text"] or "").strip() and after["visible"]
            legible = bool(after["fontPx"] and after["fontPx"] >= min_font)

            # Is the game playable again, and by what route?
            restored_by = None
            recover_error = None
            recover_hit = None
            if sess.spin_ready(recover_ms):
                restored_by = "by itself"
            elif after["recoverVisible"] and not after["recoverDisabled"]:
                # Record whether the press was refused and what is actually on
                # top of the control. Swallowing this made the evidence unable
                # to tell "the click never landed" from "it landed and did
                # nothing", which are different bugs in different files.
                recover_hit = sess.hit_test("#recover")
                try:
                    sess.page.locator("#recover").click(timeout=5000)
                except Exception as exc:
                    recover_error = f"{type(exc).__name__}: {str(exc)[:200]}"
                if sess.spin_ready(recover_ms):
                    restored_by = "the RECONNECT control"
            stuck = sess.status_line()
            log[mode] = {"faultsFired": fault["fired"], "afterFault": after,
                         "restoredBy": restored_by, "messageLegible": legible,
                         "clickError": click_error}

            if restored_by is None:
                out.append(Complaint(
                    check="resilience", severity="blocker",
                    title=f"a {mode} on /api/spin leaves the game unusable",
                    detail=("The spin button never came back and nothing on screen offers a way "
                            "forward, so the player is stuck looking at a dead game. A server fault "
                            "has to be recoverable without a reload."),
                    evidence={"mode": mode, "faultsFired": fault["fired"], "before": before,
                              "afterFault": after, "afterRecoveryAttempt": stuck,
                              "recoverWaitMs": recover_ms,
                              "recoverClickError": recover_error,
                              "whatIsOnTopOfRecover": recover_hit,
                              "spinLabelStuckOn": stuck["spinLabel"]},
                    repro={"viewport": sess.viewport.name,
                           "how": f"route **/api/spin once with {mode}, then press spin"},
                    shot=str(sess.shot(f"resilience-bricked-{mode}")),
                ))
                continue

            if not spoke:
                out.append(Complaint(
                    check="resilience", severity="major",
                    title=f"a {mode} on /api/spin fails silently",
                    detail=("The stake went out, the round did not happen, and the game never told me. "
                            "A player sees a spin that did nothing at all."),
                    evidence={"mode": mode, "faultsFired": fault["fired"],
                              "statusBefore": before["text"], "statusAfter": after["text"],
                              "statusVisible": after["visible"], "restoredBy": restored_by},
                    repro={"viewport": sess.viewport.name},
                    shot=str(sess.shot(f"resilience-silent-{mode}")),
                ))
            elif legible and any(p.lower() in said.lower() for p in cfg.get("platform_errors") or
                     ["Failed to fetch", "signal timed out", "NetworkError",
                      "Load failed", "The user aborted a request"]):
                # Matched against exact platform strings rather than a guess at
                # what "technical" reads like: the client rethrows the fetch
                # DOMException's own message, so the player is shown wording
                # written for a developer console.
                out.append(Complaint(
                    check="resilience", severity="minor",
                    title=f"the {mode} failure shows the player a browser error string",
                    detail=("The game does recover, and what it says is a raw platform message rather "
                            "than anything about the game. A player reads it as a fault in their own "
                            "machine."),
                    evidence={"mode": mode, "text": said, "role": after["role"],
                              "matched": [p for p in (cfg.get("platform_errors") or
                                          ["Failed to fetch", "signal timed out", "NetworkError",
                                           "Load failed", "The user aborted a request"])
                                          if p.lower() in said.lower()]},
                    repro={"viewport": sess.viewport.name,
                           "how": f"route **/api/spin once with {mode}, then press spin"},
                ))
            elif not legible:
                out.append(Complaint(
                    check="resilience", severity="minor",
                    title=f"the {mode} failure message renders at {after['fontPx']:.0f}px",
                    detail="The game does say what went wrong, but not at a size a player can read.",
                    evidence={"mode": mode, "text": said, "fontPx": after["fontPx"], "floorPx": min_font},
                    repro={"viewport": sess.viewport.name},
                ))

            # A message and a live button still are not a working game.
            round_before = sess.status_line()["round"]
            sess.spin()
            if not sess.round_advanced(round_before, int(cfg.get("round_ms", 15000))):
                round_after = sess.status_line()["round"]
                out.append(Complaint(
                    check="resilience", severity="blocker",
                    title=f"after a {mode} the next spin is a silent no-op",
                    detail=("The button was pressable again and pressing it did not advance a round. "
                            "The game looks alive and is not."),
                    evidence={"mode": mode, "roundBefore": round_before, "roundAfter": round_after,
                              "restoredBy": restored_by, "state": sess.status_line()},
                    repro={"viewport": sess.viewport.name},
                    shot=str(sess.shot(f"resilience-noop-{mode}")),
                ))
        finally:
            fault["unroute"]()
            # Hand the game back before the next mode — and before every check
            # that runs after this one. The first sweep proved why: a 500 that
            # was injected and then left un-recovered took the game OFFLINE,
            # every later mode reported "could not press spin", and the
            # backgrounding check filed a blocker against a game this check had
            # bricked. Cleaning up after yourself is part of the measurement.
            if not sess.spin_ready(2000):
                try:
                    recover = sess.page.locator("#recover")
                    if recover.count() and recover.is_visible():
                        recover.click(timeout=4000)
                except Exception:
                    pass
                if not sess.spin_ready(int(cfg.get("recover_ms", 9000))):
                    sess.page.reload(wait_until="load")
                    sess.open()

    if not exercised:
        return out + [undetermined(
            "resilience", "no fault was actually injected, so nothing was tested",
            "Every mode failed to reach the client. This check contributed no evidence at all "
            "about how the game behaves under a server fault.",
            repro={"viewport": sess.viewport.name},
            modesRequested=modes, modesExercised=[])]

    # Praise only when nothing at all was left unmeasured: a note beside a
    # praise line reads as a clean bill of health with a footnote, and the
    # footnote is the part that matters.
    if not [f for f in out if f.severity != "praise"]:
        out.append(praise("resilience", f"the game survives every server fault I could inject at {sess.viewport.name}",
                          "For each fault it showed the player a readable message and handed the spin "
                          "button back, and the next spin really played a round.",
                          modesExercised=exercised, perMode=log))
    return out


# --- backgrounding ----------------------------------------------------------

@check("backgrounding")
def backgrounding(sess: GameSession, cfg: dict[str, Any]) -> list[Complaint]:
    """Coming back to a tab that was in the background must not leave it broken.

    This game pauses every clip on `visibilitychange` on purpose, in half a
    dozen modules. That is right, and it means the restore path is the one that
    can rot silently: a clip that never gets played again looks like a still
    frame, which is nearly what it should look like.

    Two things make this measurable rather than a guess. Only clips that were
    *playing before* the hide are judged, so the one sprite that is legitimately
    parked does not read as a defect. And playback is proved by `currentTime`
    advancing between two samples, not by `paused === false` — a video can be
    unpaused and still frozen, which is exactly what the sabotage produces.
    """
    hidden_ms = int(cfg.get("hidden_ms", 6000))
    restore_ms = int(cfg.get("restore_ms", 3000))
    sample_gap_ms = int(cfg.get("sample_gap_ms", 1200))
    max_new_videos = int(cfg.get("max_new_videos", 4))
    max_new_animations = int(cfg.get("max_new_animations", 6))

    sess.wait_for_spectacle()
    # Do not inherit somebody else's wreckage and file it as this check's
    # finding. A previous sweep had this check report "the game will not take a
    # spin after the tab comes back" about a game the resilience check had left
    # offline several minutes earlier — a blocker aimed at the wrong code.
    if not sess.spin_ready(int(cfg.get("ready_ms", 20000))):
        return [undetermined(
            "backgrounding", "the game was already not accepting spins before I hid the tab",
            "Whatever state it was left in, it was not this check's doing and nothing about "
            "backgrounding was measured.",
            repro={"viewport": sess.viewport.name},
            stateBefore=sess.status_line())]

    before = sess.playback()
    playing = {v["file"]: v for v in before["videos"] if not v["paused"] and not v["ended"]}

    hide = sess.set_page_hidden(True)
    sess.page.wait_for_timeout(hidden_ms)
    during = sess.playback()
    show = sess.set_page_hidden(False)
    sess.page.wait_for_timeout(restore_ms)
    after = sess.playback()
    sess.page.wait_for_timeout(sample_gap_ms)
    later = sess.playback()

    out: list[Complaint] = []

    # Before judging the game, establish that the tab really went away and that
    # the app noticed. An override that the app never saw would let every
    # assertion below pass while testing nothing.
    if not during["hidden"]:
        # Visibility was already restored above, before any of these
        # judgements — the next check never inherits a hidden tab.
        return [undetermined(
            "backgrounding", "the tab could not be put into the background",
            f"document.hidden stayed false with the {hide['mechanism']} mechanism, so the game was "
            "never backgrounded and nothing here was tested.",
            repro={"viewport": sess.viewport.name},
            mechanism=hide["mechanism"], overrideApplied=hide.get("applied"),
            overrideError=hide.get("reason"), during=during)]
    reacted = (sum(1 for v in during["videos"] if v["paused"]) > sum(1 for v in before["videos"] if v["paused"])
               or during["animationsRunning"] < before["animationsRunning"])
    if not reacted:
        out.append(undetermined(
            "backgrounding", "hiding the tab changed nothing the probe can see",
            "Neither playback nor animations reacted, so I cannot tell whether the app received the "
            "event at all. Everything below may be measuring an override the game ignored.",
            repro={"viewport": sess.viewport.name},
            mechanism=hide["mechanism"],
            pausedBefore=sum(1 for v in before["videos"] if v["paused"]),
            pausedDuring=sum(1 for v in during["videos"] if v["paused"]),
            animationsRunningBefore=before["animationsRunning"],
            animationsRunningDuring=during["animationsRunning"]))

    by_file_after = {v["file"]: v for v in after["videos"]}
    by_file_later = {v["file"]: v for v in later["videos"]}
    swapped: list[str] = []
    for name in playing:
        a, b = by_file_after.get(name), by_file_later.get(name)
        if not a or not b:
            swapped.append(name)  # the scene moved on; sprite_motion owns handoffs
            continue
        if b.get("errorCode") is not None or b["readyState"] == 0:
            out.append(Complaint(
                check="backgrounding", severity="major",
                title=f"{name} came back from the background with nothing to decode",
                detail="This clip was playing before I hid the tab and cannot paint after I showed it again.",
                evidence={"file": name, "before": playing[name], "afterRestore": a, "later": b},
                repro={"viewport": sess.viewport.name},
                shot=str(sess.shot("backgrounding-undecoded")),
            ))
            continue
        if b["ended"]:
            continue  # a clip that genuinely finished is not stalled
        looped = b["loop"] and b["currentTime"] < a["currentTime"] - 0.01
        advanced = looped or b["currentTime"] > a["currentTime"] + 0.01
        if b["paused"] or not advanced:
            out.append(Complaint(
                check="backgrounding", severity="major",
                title=f"{name} never resumed after the tab came back",
                detail=("This clip was playing before the tab went into the background and is frozen "
                        "afterwards. The room reads as a still photograph of itself, with no error "
                        "anywhere to say why."),
                evidence={"file": name, "playingBefore": playing[name],
                          "pausedAfterRestore": b["paused"],
                          "currentTimeAtRestore": a["currentTime"],
                          f"currentTimeAfter{sample_gap_ms}ms": b["currentTime"],
                          "advanced": advanced, "loop": b["loop"], "ended": b["ended"],
                          "readyState": b["readyState"], "hiddenMs": hidden_ms},
                repro={"viewport": sess.viewport.name,
                       "how": "dispatch visibilitychange with document.hidden true, wait, then restore"},
                shot=str(sess.shot("backgrounding-stalled")),
            ))

    grew = {"videos": later["videosTotal"] - before["videosTotal"],
            "animations": later["animations"] - before["animations"],
            "nodes": later["nodes"] - before["nodes"]}
    if grew["videos"] > max_new_videos or grew["animations"] > max_new_animations:
        out.append(Complaint(
            check="backgrounding", severity="major",
            title=f"the background trip left {grew['videos']} extra videos and {grew['animations']} extra animations behind",
            detail=("Work queued up while the tab was away and was not collapsed on the way back. "
                    "A player who alt-tabs a few times pays for every one of them."),
            evidence={"before": {k: before[k] for k in ("videosTotal", "animations", "nodes")},
                      "after": {k: later[k] for k in ("videosTotal", "animations", "nodes")},
                      "growth": grew, "limits": {"videos": max_new_videos, "animations": max_new_animations}},
            repro={"viewport": sess.viewport.name},
        ))

    if not sess.spin_ready(int(cfg.get("ready_ms", 20000))):
        out.append(Complaint(
            check="backgrounding", severity="blocker",
            title="the game will not take a spin after the tab comes back",
            detail="Returning to the tab left the spin button unusable, so the session is dead.",
            evidence={"state": sess.status_line(), "playback": later},
            repro={"viewport": sess.viewport.name},
            shot=str(sess.shot("backgrounding-nospin")),
        ))
    else:
        round_before = sess.status_line()["round"]
        sess.spin()
        if not sess.round_advanced(round_before, int(cfg.get("round_ms", 15000))):
            out.append(Complaint(
                check="backgrounding", severity="blocker",
                title="the first spin after coming back does nothing",
                detail="The button was live and pressing it did not advance a round.",
                evidence={"roundBefore": round_before, "state": sess.status_line()},
                repro={"viewport": sess.viewport.name},
                shot=str(sess.shot("backgrounding-noop")),
            ))

    if not playing:
        return out + [undetermined(
            "backgrounding", "nothing was playing before I hid the tab, so resume was not tested",
            "Zero clips were running when the measurement started. Whatever the restore path does, "
            "this run did not exercise it.",
            repro={"viewport": sess.viewport.name},
            videosVisible=before["videosVisible"], videosTotal=before["videosTotal"],
            mechanism=hide["mechanism"])]

    # Praise only when nothing at all was left unmeasured: a note beside a
    # praise line reads as a clean bill of health with a footnote, and the
    # footnote is the part that matters.
    if not [f for f in out if f.severity != "praise"]:
        out.append(praise("backgrounding", f"the game survives a trip to the background at {sess.viewport.name}",
                          "Every clip that was playing before is playing again with its clock moving, "
                          "nothing piled up while the tab was away, and a spin still plays.",
                          clipsWatched=sorted(playing), clipsSwappedMidWatch=swapped,
                          hiddenMs=hidden_ms, mechanism=hide["mechanism"],
                          pausedWhileHidden=sum(1 for v in during["videos"] if v["paused"]),
                          growth=grew, restoredTo=show))
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
                          "Nothing broke in the background while I played. Faults the bot injected "
                          "itself are counted separately rather than dropped, so this is a claim "
                          "about the game and not about what the bot could not see.",
                          botInjectedFaults=len(sess.injected_failures),
                          botInjectedSample=sess.injected_failures[:4]))
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
