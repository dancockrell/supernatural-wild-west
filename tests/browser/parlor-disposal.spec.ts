import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('parlor layers pause together and disposal releases listeners and media', async ({ page }) => {
  await page.route('**/video/**', route => route.abort());
  await page.setContent('<div id="app"><canvas id="frontier"></canvas><aside class="boundary-cast"></aside></div>');
  const source = ['exterior-residents', 'narrative-gambler', 'resident-fog', 'parlor-scene']
    .map(name => readFileSync(`src/client/${name}.ts`, 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export class /g, 'class '))
    .join('\n');
  await page.addScriptTag({ content: ts.transpileModule(source + '\nObject.assign(window,{ParlorScene});', {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText });
  const result = await page.evaluate(() => {
    const counters = { play: 0, pause: 0, load: 0 };
    HTMLMediaElement.prototype.play = function () { counters.play++; return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { counters.pause++; };
    HTMLMediaElement.prototype.load = function () { counters.load++; };
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
    scene.dispose(); scene.dispose();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    const disposedPlay = counters.play;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('resize'));
    videos.forEach(v => { v.dispatchEvent(new Event('ended')); v.dispatchEvent(new Event('loadedmetadata')); });
    scene.setReducedMotion(false); scene.setPhase(false);
    return { reducedStayed, resumed, hiddenStayed,
      stayedDisposed: counters.play === disposedPlay,
      released: videos.every(v => !v.isConnected && !v.hasAttribute('src')),
      loads: counters.load, count: videos.length,
      hosts: document.querySelectorAll('.narrative-gambler,.parlor-exterior-residents').length };
  });
  expect(result).toEqual({ reducedStayed: true, resumed: true, hiddenStayed: true,
    stayedDisposed: true, released: true, loads: 12, count: 12, hosts: 0 });
});



