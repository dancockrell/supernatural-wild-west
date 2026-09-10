import { test, expect } from "@playwright/test";
import { injectClient } from "./client-module";

test("hand classifications retain their authored timing even when the overall spin is below wager", async ({
  page,
}) => {
  await page.setContent('<div class="controls"></div><div id="cabinet"></div>');
  await injectClient(page, {
    modules: ["poker-motion", "poker-table"],
    stubs: { cardFace: '()=>"<span>card</span>"' },
    expose: ["PokerTable"],
  });
  const result = await page.evaluate(async () => {
    const timings: { duration: number; delay: number }[] = [];
    const native = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = function (frames, options) {
      if (this.classList.contains("poker-slot")) {
        const o = options as KeyframeAnimationOptions;
        timings.push({ duration: Number(o.duration), delay: Number(o.delay) });
      }
      return native.call(this, frames, options);
    };
    const table = new (window as any).PokerTable(
      document.getElementById("cabinet"),
      () => {},
    );
    const awards: string[] = [];
    document
      .querySelector(".player-play-space")!
      .addEventListener("hand-award", (e) =>
        awards.push((e as CustomEvent).detail),
      );
    const base = {
      configVersion: "dd-1.4.0",
      payout: 10,
      bet: 100,
      state: { poker: { cards: [] } },
      poker: {
        cards: [0, 1, 2, 3, 4],
        cells: [],
        complete: true,
        amount: 10,
        rank: "Straight",
      },
    };
    await table.show(base, true);
    const straight = timings.splice(0);
    await table.show(
      {
        ...base,
        poker: {
          ...base.poker,
          rank: "Royal flush",
          cards: [8, 9, 10, 11, 12],
        },
      },
      true,
    );
    const royal = timings.splice(0);
    table.setReduced(true);
    await table.show(base, true);
    const reducedCount = timings.length;
    table.setReduced(false);
    await table.show(base, false);
    await table.show({ ...base, poker: { ...base.poker, amount: 0 } }, true);
    await table.show(
      { ...base, poker: { ...base.poker, complete: false } },
      true,
    );
    return { straight, royal, reducedCount, awards };
  });
  expect(result.straight).toEqual(
    [0, 120, 240, 360, 480].map((delay) => ({ duration: 650, delay })),
  );
  expect(result.royal).toEqual(
    [180, 90, 0, 90, 180].map((delay) => ({ duration: 1500, delay })),
  );
  expect(result.reducedCount).toBe(0);
  expect(result.awards).toEqual(["Straight", "Royal flush"]);
});
