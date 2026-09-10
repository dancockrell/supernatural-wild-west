"""Play the game, evaluate it, and file complaints.

    python bot/run.py                      # obey bot/directives.json
    python bot/run.py --only seams,ledger  # one-off focus
    python bot/run.py --headed             # watch it play

Claude steers this by editing bot/directives.json; the bot answers in
bot/out/complaints.jsonl. That file is the whole interface between us.
"""
from __future__ import annotations

import argparse
import json
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from playbot import checks, selftest  # noqa: E402
from playbot.complaints import Complaint, ComplaintLog  # noqa: E402
from playbot.session import GameSession, Viewport  # noqa: E402


def load_directives(path: Path) -> dict:
    if not path.exists():
        raise SystemExit(f"No directives at {path}. That file is how Claude tells the bot what to care about.")
    return json.loads(path.read_text(encoding="utf-8"))


def run_session(directives: dict, viewport: Viewport, log: ComplaintLog, only: set[str] | None, headed: bool) -> None:
    url = directives.get("url", "http://localhost:5180/?parlor=1")
    shots = ROOT / directives.get("shots_dir", "out/shots")
    checks_cfg: dict = directives.get("checks", {})
    warmup = int(directives.get("warmup_spins", 2))

    with GameSession(url, viewport, shots, headless=not headed) as sess:
        sess.open()

        # Play a little first so the checks see a game in motion, not a cold load.
        for _ in range(warmup):
            sess.spin()
        for _ in range(int(directives.get("bet_nudges", 1))):
            sess.nudge_bet(up=True)

        for name, cfg in checks_cfg.items():
            if cfg.get("enabled") is False:
                continue
            if only and name not in only:
                continue
            fn = checks.REGISTRY.get(name)
            if not fn:
                log.file(Complaint(
                    check="directives", severity="note",
                    title=f"unknown check {name!r}",
                    detail="The directives ask for a check that does not exist yet. Build it or drop it.",
                    evidence={"known": sorted(checks.REGISTRY)},
                ))
                continue
            if viewport.name in [v for v in cfg.get("skip_viewports", [])]:
                continue
            try:
                log.extend(fn(sess, cfg))
            except Exception as exc:  # a broken instrument is itself a finding
                log.file(Complaint(
                    check=name, severity="note",
                    title=f"the {name} check crashed",
                    detail="This instrument failed, so it proved nothing this run. Treat its silence as unknown, not clean.",
                    evidence={"error": f"{type(exc).__name__}: {exc}",
                              "trace": traceback.format_exc(limit=4)},
                    repro={"viewport": viewport.name},
                ))

        # Health last: it accumulates over everything the session did.
        if not only or "health" in only:
            try:
                log.extend(checks.REGISTRY["health"](sess, checks_cfg.get("health", {})))
            except Exception:
                pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--directives", default=str(ROOT / "directives.json"))
    parser.add_argument("--only", default="", help="comma separated check names")
    parser.add_argument("--headed", action="store_true")
    parser.add_argument("--selftest", action="store_true",
                        help="break things on purpose and prove each check notices")
    args = parser.parse_args()

    directives = load_directives(Path(args.directives))
    only = {s.strip() for s in args.only.split(",") if s.strip()} or None

    if args.selftest:
        vp = Viewport(**directives.get("viewports", [{"width": 1920, "height": 1080}])[0])
        with GameSession(directives.get("url"), vp, ROOT / "out/shots", headless=not args.headed) as sess:
            sess.open()
            results = selftest.run(sess)
        blind = [r for r in results if r.get("verdict") != "OK"]
        for r in results:
            print(f"  [{r.get('verdict')}] {r['check']}: {r.get('sabotage', '')}")
        print()
        if blind:
            print(f"{len(blind)} of {len(results)} checks did NOT catch their own defect. "
                  "Their silence in a normal run means nothing.")
            return 1
        print(f"All {len(results)} checks caught the defect they are meant to catch, "
              "and stayed quiet on the healthy game.")
        return 0

    out = ROOT / directives.get("complaints", "out/complaints.jsonl")
    if out.exists():
        out.unlink()
    log = ComplaintLog(out)

    viewports = [Viewport(**v) for v in directives.get("viewports", [{"width": 1920, "height": 1080, "label": "desktop"}])]
    for viewport in viewports:
        print(f"-- playing at {viewport.name}")
        try:
            run_session(directives, viewport, log, only, args.headed)
        except Exception as exc:
            log.file(Complaint(
                check="session", severity="blocker",
                title=f"the game would not let me play at {viewport.name}",
                detail="The session itself failed, so nothing else could be checked at this size.",
                evidence={"error": f"{type(exc).__name__}: {exc}", "trace": traceback.format_exc(limit=6)},
                repro={"viewport": viewport.name, "url": directives.get("url")},
            ))

    print()
    print(log.summary())
    print(f"\nfull detail: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
