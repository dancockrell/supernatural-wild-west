import { test, expect } from "@playwright/test";
for (const viewport of [
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1199, height: 800 },
  { width: 1200, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
]) {
  test(`resident movie content clears cabinet at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const sides = page.locator(".ghost-porch");
    await expect(sides).toHaveCount(2);
    if (viewport.width <= 900) {
      await expect(page.locator(".boundary-cast")).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
      await expect(page.locator("#spin")).toBeInViewport();
      return;
    }
    await expect
      .poll(() =>
        sides
          .locator("video")
          .evaluateAll((v) =>
            v.every((e) => (e as HTMLVideoElement).readyState >= 2),
          ),
      )
      .toBe(true);
    const geometry = await sides.evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element),
          video = element.querySelector("video")!,
          box = video.getBoundingClientRect();
        const scale = Math.min(
            box.width / video.videoWidth,
            box.height / video.videoHeight,
          ),
          width = video.videoWidth * scale,
          height = video.videoHeight * scale;
        const left = box.left + (box.width - width) / 2,
          top = box.top + (box.height - height) * 0.3;
        const shell = document
          .querySelector(".cabinet")!
          .getBoundingClientRect();
        return {
          left,
          right: left + width,
          top,
          bottom: top + height,
          shellLeft: shell.left,
          shellRight: shell.right,
          isLeft: element.classList.contains("left"),
          background: style.backgroundColor,
          image: style.backgroundImage,
          fit: getComputedStyle(video).objectFit,
          ratio: video.videoWidth / video.videoHeight,
        };
      }),
    );
    for (const side of geometry) {
      expect(side.background).toBe("rgba(0, 0, 0, 0)");
      expect(side.image).toBe("none");
      expect(side.fit).toBe("contain");
      expect(side.ratio).toBeCloseTo(9 / 16, 2);
      expect(side.left).toBeGreaterThanOrEqual(0);
      expect(side.right).toBeLessThanOrEqual(viewport.width);
      expect(side.top).toBeGreaterThanOrEqual(0);
      expect(side.bottom).toBeLessThanOrEqual(viewport.height);
      if (side.isLeft)
        expect(side.right).toBeLessThanOrEqual(side.shellLeft + 1);
      else expect(side.left).toBeGreaterThanOrEqual(side.shellRight - 1);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(viewport.width);
    await expect(page.locator("#spin")).toBeInViewport();
  });
}

