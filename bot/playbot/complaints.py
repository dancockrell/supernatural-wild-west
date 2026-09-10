"""Findings are the bot's half of the conversation.

Two kinds: complaints and praise. Praise is not decoration — it records that an
instrument looked and was satisfied, which is the only thing separating "this
is fine" from "nothing checked it". A run with no complaints and no praise
means the bot proved nothing.

Every finding carries a measurement. "Looks wrong" is not actionable; "the
shadow centre sits 78px above the boot line" is.
"""
from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

SEVERITIES = ("blocker", "major", "minor", "note", "praise")


@dataclass
class Finding:
    check: str
    severity: str
    title: str
    detail: str
    evidence: dict[str, Any] = field(default_factory=dict)
    repro: dict[str, Any] = field(default_factory=dict)
    shot: str | None = None
    at: float = field(default_factory=time.time)

    def __post_init__(self) -> None:
        if self.severity not in SEVERITIES:
            raise ValueError(f"unknown severity {self.severity!r}; use one of {SEVERITIES}")


# Complaint stays as the name for the failing kind; praise is its counterpart.
Complaint = Finding


def praise(check: str, title: str, detail: str, **evidence: Any) -> Finding:
    return Finding(check=check, severity="praise", title=title, detail=detail, evidence=evidence)


class ComplaintLog:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.items: list[Finding] = []

    def file(self, finding: Finding) -> None:
        self.items.append(finding)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(asdict(finding)) + "\n")

    def extend(self, findings: list[Finding]) -> None:
        for finding in findings:
            self.file(finding)

    @property
    def complaints(self) -> list[Finding]:
        return [f for f in self.items if f.severity != "praise"]

    def summary(self) -> str:
        if not self.items:
            return "Nothing was recorded at all. The bot did not actually look at anything."
        by_sev: dict[str, int] = {}
        for item in self.items:
            by_sev[item.severity] = by_sev.get(item.severity, 0) + 1
        order = [s for s in SEVERITIES if s in by_sev]
        lines = [", ".join(f"{by_sev[s]} {s}" for s in order)]
        if not self.complaints:
            lines.append("No complaints — and the praise lines below say what was actually verified.")
        for sev in SEVERITIES:
            for item in self.items:
                if item.severity != sev:
                    continue
                mark = "+" if sev == "praise" else "!"
                lines.append(f"  {mark} [{sev}] {item.check}: {item.title}")
        return "\n".join(lines)
