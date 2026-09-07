import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import ts from "typescript";

test("cancelled hand films cannot restart from late decode events", async ({
  page,
}) => {
  await page.setContent('<div id="host"></div>');
  const source = readFileSync("src/client/poker-guests.ts", "utf8")
    .replace(/^import .*;\r?\n/gm, "")
    .replace("export class", "class");
  await page.addScriptTag({
    content: ts.transpileModule(
      `function ghostSprite(){return document.createElement('video');} function parlorResidentMedia(){return {reaction:'test.webm'};} ${source};ADMITTED_V3_HANDS.clear();Object.assign(window,{PokerGuests});`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText,
  });
  const result = await page.evaluate(() => {
    document.documentElement.classList.add("unified-parlor");
    let plays = 0,
      cues = 0;
    HTMLMediaElement.prototype.play = function () {
      plays++;
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {};
    HTMLMediaElement.prototype.load = function () {};
    const host = document.getElementById("host")!;
    const controller = new (window as any).PokerGuests(host, () => cues++);
    controller.play("Full house");
    const stale = [...host.querySelectorAll("video")];
    controller.stop();
    for (const video of stale) {
      video.dispatchEvent(new Event("loadeddata"));
      video.dispatchEvent(new Event("playing"));
      video.dispatchEvent(new Event("timeupdate"));
    }
    const cancelled = host.querySelectorAll("video").length;
    controller.setReduced(true);
    controller.play("Pair");
    const reduced = host.querySelectorAll("video").length;
    controller.setReduced(false);
    controller.play("Pair");
    const active = host.querySelectorAll("video").length;
    host.querySelector("video")!.dispatchEvent(new Event("ended"));
    const ended = host.querySelectorAll("video").length;
    controller.play("Pair");
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    const hidden = host.querySelectorAll("video").length;
    controller.dispose();
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    host.dispatchEvent(new CustomEvent("hand-award", { detail: "Pair" }));
    return {
      plays,
      cues,
      cancelled,
      reduced,
      active,
      ended,
      hidden,
      disposed: host.children.length,
    };
  });
  expect(result).toEqual({
    plays: 0,
    cues: 0,
    cancelled: 0,
    reduced: 0,
    active: 1,
    ended: 0,
    hidden: 0,
    disposed: 0,
  });
});
