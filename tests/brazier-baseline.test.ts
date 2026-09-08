import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { parlorResidentMedia } from '../src/client/resident-media';
import baseline from '../docs/women-performance-restoration.json';

it('retains six distinct original performances for each woman', () => {
 for (const key of ['queen','medium'] as const) {
  const media=parlorResidentMedia(key);
  const paths=[media.idle,media.alternate,media.characterIdle,...media.quietVariants,media.reaction];
  expect(new Set(paths).size).toBe(6);
  for(const path of paths) expect(baseline.files.some(file=>file.path===path)).toBe(true);
 }
});
it('keeps all twenty restored films and posters identical to the morning originals', () => {
 expect(baseline.files).toHaveLength(40);
 for(const file of baseline.files) {
  const bytes=readFileSync(resolve('public',file.path.slice(1)));
  expect(createHash('sha256').update(bytes).digest('hex'),file.path).toBe(file.sha256);
 }
});
