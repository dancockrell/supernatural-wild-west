import { test, expect } from '@playwright/test';
import { injectClient } from './client-module';

test('parlor layers pause together and disposal releases listeners and media', async ({ page }) => {
  await page.route('**/video/**', route => route.abort());
  await page.setContent('<div id="app"><canvas id="frontier"></canvas><aside class="boundary-cast"></aside></div>');
  await injectClient(page, {
    modules: [
      'character-sequence', 'resident-sequence', 'resident-reactions', 'exterior-residents',
      'ghost-hand', 'narrative-gambler', 'parlor-light', 'parlor-scene',
    ],
    expose: ['ParlorScene'],
  });
  const result = await page.evaluate(() => {
    const counters = { play: 0, pause: 0, load: 0 };
    // Per element, because a resident also load()s its own clips while
    // preloading; only the disposal load is this test's business.
    const loadsPer = new Map<HTMLMediaElement, number>();
    HTMLMediaElement.prototype.play = function () { counters.play++; return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { counters.pause++; };
    HTMLMediaElement.prototype.load = function () {
      counters.load++;
      loadsPer.set(this, (loadsPer.get(this) ?? 0) + 1);
    };
    const Scope = window as unknown as { ParlorScene: new (c: HTMLCanvasElement) => {
      setReducedMotion(v: boolean): void; setPhase(v: boolean): void; dispose(): void;
    } };
    const scene = new Scope.ParlorScene(document.querySelector('canvas')!);
    const videos = [...document.querySelectorAll('video')];
    scene.setReducedMotion(true);
    const reducedPlay = counters.play;
    window.dispatchEvent(new Event('resize'));
    videos.forEach(v => v.dispatchEvent(new Event('ended')));
    const reducedStayed = counters.play === reducedPlay;
    scene.setReducedMotion(false);
    const resumed = counters.play > reducedPlay;
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    const hiddenPlay = counters.play;
    scene.setPhase(true);
    const hiddenStayed = counters.play === hiddenPlay;
    const loadsBeforeDisposal = new Map(videos.map(v => [v, loadsPer.get(v) ?? 0]));
    scene.dispose(); scene.dispose();
    // Every element must be told to drop its decoder exactly once, and the
    // second dispose() must not repeat it.
    const releasedOnce = videos.filter(v => (loadsPer.get(v) ?? 0) - loadsBeforeDisposal.get(v)! === 1).length;
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    const disposedPlay = counters.play;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('resize'));
    videos.forEach(v => { v.dispatchEvent(new Event('ended')); v.dispatchEvent(new Event('loadedmetadata')); });
    scene.setReducedMotion(false); scene.setPhase(false);
    return { reducedStayed, resumed, hiddenStayed,
      stayedDisposed: counters.play === disposedPlay,
      released: videos.every(v => !v.isConnected && !v.hasAttribute('src')),
      releasedOnce, count: videos.length,
      hosts: document.querySelectorAll('.narrative-gambler,.parlor-exterior-residents').length };
  });
  expect(result).toEqual({ reducedStayed: true, resumed: true, hiddenStayed: true,
    stayedDisposed: true, released: true, releasedOnce: 12, count: 12, hosts: 0 });
});



