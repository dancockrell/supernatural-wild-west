import { CONFIG } from "./config";
import type { Grid } from "./types";

export function evaluateGold(grid: Grid, bet: number) {
  if (grid.length !== 5 || grid.some((reel) => reel.length !== 5))
    throw new Error("Expected square gold board");
  const candidates = [
    ...Array.from({ length: 5 }, (_, row) =>
      Array.from({ length: 5 }, (_, reel) => reel * 5 + row),
    ),
    ...Array.from({ length: 5 }, (_, reel) =>
      Array.from({ length: 5 }, (_, row) => reel * 5 + row),
    ),
    [0, 6, 12, 18, 24],
    [4, 8, 12, 16, 20],
  ];
  const flat = grid.flat();
  const fullScreen = flat.every((symbol) => symbol === "gold");
  const lines = candidates.filter((line) =>
    line.every((cell) => flat[cell] === "gold"),
  );
  return {
    lines,
    cells: [...new Set(lines.flat())],
    fullScreen,
    amount:
      bet *
      (fullScreen ? CONFIG.goldScreenPay : lines.length * CONFIG.goldLinePay),
  };
}
