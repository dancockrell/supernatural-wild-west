import { test, expect } from "@playwright/test";
import { initialState, resolveSpin } from "../../src/engine/engine";
import { RecordingRng, SeededRng } from "../../src/engine/rng";

test("your foreground hand keeps authoritative progress across spins and reconnect", async ({
  page,
}) => {
  const before = initialState();
  const first = resolveSpin(before, 100, new SeededRng(19), "player-card-1");
  const second = resolveSpin(
    first.state,
    100,
    new SeededRng(20),
    "player-card-2",
  );
  expect(first.poker?.cards.length).toBe(1);
  expect(second.poker?.cards.length).toBe(2);
  let last: typeof first | null = null,
    calls = 0;
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { state: last?.state || before, lastResult: last } }),
  );
  await page.route("**/api/spin", (route) => {
    last = calls++ ? second : first;
    return route.fulfill({ json: last });
  });
  await page.goto("/");
  await expect(page.locator("#connection")).toContainText("CONNECTED");
  for (const expected of [first, second]) {
    await page.locator("#spin").click();
    await expect(page.locator("#spin-label")).toHaveText("SPIN");
    await expect(page.locator(".poker-cards .poker-slot.dealt")).toHaveCount(
      expected.poker!.cards.length,
    );
    expect(
      await page
        .locator(".poker-cards .playing-card")
        .evaluateAll((cards) =>
          cards.map((card) => Number((card as HTMLElement).dataset.card)),
        ),
    ).toEqual(expected.poker!.cards);
  }
  await page.reload();
  await expect(page.locator(".poker-cards .poker-slot.dealt")).toHaveCount(2);
  await expect(page.locator(".poker-award")).toHaveText("");
  await expect(page.locator(".poker-flying-card")).toHaveCount(0);
  expect(calls).toBe(2);
});

for (const width of [1440, 390])
  test(`poker deals, pays, restores and fits at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const before = {
      ...initialState(),
      poker: { cards: [0, 1, 2, 3], bet: 100 },
    };
    let result: ReturnType<typeof resolveSpin> | undefined;
    for (let seed = 1; seed < 100; seed++) {
      const candidate = resolveSpin(
        before,
        100,
        new RecordingRng(new SeededRng(seed)),
        "poker-browser",
      );
      if (
        candidate.poker?.complete &&
        candidate.poker.amount &&
        !candidate.events.some((e) =>
          ["witching", "bonus-start"].includes(e.type),
        )
      ) {
        result = candidate;
        break;
      }
    }
    expect(result).toBeTruthy();
    let settled = false,
      calls = 0;
    await page.route("**/api/session", (r) =>
      r.fulfill({
        json: {
          state: settled ? result!.state : before,
          lastResult: settled ? result : null,
        },
      }),
    );
    await page.route("**/api/spin", (r) => {
      calls++;
      settled = true;
      return r.fulfill({ json: result });
    });
    await page.goto("/");
    await expect(page.locator("#connection")).toContainText("CONNECTED");
    await expect(page.locator(".player-play-space")).toHaveCount(1);
    // VACUOUS ABSENCE, REPLACED. This required
    // `.opponent-place,.opponent-cards,.dealer-stage,.table-environment` to be
    // absent. None of those four is written by any source file in any commit -
    // `.dealer-stage` and `.opponent-*` survive only as orphaned rules in
    // src/client/player-ui.css, `.table-environment` nowhere at all - so the
    // count was 0 by construction and the line could not fail whatever the
    // product did. A tombstone reads exactly like a check and is worth nothing
    // as one. The property it was reaching for is that this is a one-seat
    // table, which is falsifiable: a second seat would make it 2.
    await expect(page.locator(".poker-table .player-seat")).toHaveCount(1);
    expect(
      await page
        .locator(".player-play-space")
        .evaluate((el) =>
          el.previousElementSibling?.classList.contains("controls"),
        ),
    ).toBe(true);
    await expect(page.locator(".poker-cards .poker-slot.dealt")).toHaveCount(4);
    // Reversed 10 Sep 2026: four cards showing used to freeze the bet
    // controls. Now the fifth card's odds are known exactly, and a player
    // who raises on that information is pricing it in, not exploiting an
    // oversight — see src/engine/optimal-strategy.ts. The button stays
    // enabled here on purpose.
    await expect(page.locator("#bet-up")).toBeEnabled();
    // Observe the brief flight at insertion rather than racing a polling interval.
    await page.evaluate(() => {
      const observer = new MutationObserver(() => {
        const flight = document.querySelector<HTMLElement>('.poker-flying-card');
        if (!flight) return;
        const rect = flight.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && getComputedStyle(flight).visibility !== 'hidden') {
          document.body.dataset.observedPokerFlight = 'visible';
          observer.disconnect();
        }
      });
      observer.observe(document.body, {childList:true});
    });
    await page.locator("#spin").click();
    await expect(page.locator('body')).toHaveAttribute('data-observed-poker-flight','visible');
    await expect(page.locator(".symbol.poker-collected")).toHaveCount(1);
    expect(
      await page
        .locator(".symbol.poker-collected .playing-card")
        .evaluateAll((els) =>
          els
            .map((e) => Number((e as HTMLElement).dataset.card))
            .sort((a, b) => a - b),
        ),
    ).toEqual([result!.poker!.cards[4]]);
    await expect(page.locator(".poker-award")).toContainText(
      result!.poker!.rank,
    );
    await expect(page.locator("#spin-label")).toHaveText("SPIN");
    await expect(page.locator(".poker-cards .poker-slot.dealt")).toHaveCount(5);
    await expect(page.locator(".poker-award strong")).toHaveText(
      `${(result!.poker!.amount / 100).toFixed(2)} CR`,
    );
    await expect(page.locator(".duel-result")).toHaveCount(0);
    await expect(page.locator(".player-play-space")).not.toContainText(
      /DEAD MAN WINS|HAND WON|TIE/,
    );
    await page.screenshot({ path: `docs/screenshots/poker-hand-${width}.png` });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    await expect(page.locator(".poker-cards .poker-slot.dealt")).toHaveCount(5);
    await expect(page.locator(".poker-flying-card")).toHaveCount(0);
    await expect(page.locator(".poker-award")).toContainText(
      result!.poker!.rank,
    );
    await expect(page.locator(".poker-award strong")).toHaveText(
      `${(result!.poker!.amount / 100).toFixed(2)} CR`,
    );
    expect(calls).toBe(1);
  });

