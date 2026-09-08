import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { parlorResidentMedia } from '../src/client/resident-media';
import baseline from '../docs/solid-women-admission.json';

// The user preferred this appearance and rejected the subsequent native-video swap.
// Playback progress alone cannot establish that a replacement is visually acceptable.
it('keeps every active brazier body and poster on the restored visual baseline', () => {
  const media = parlorResidentMedia('medium');
  const paths = [media.idle, media.alternate, media.characterIdle, media.reaction, ...media.quietVariants];
  for (const video of paths) {
    for (const path of [video, video.replace(/\.webm$/, '.png')]) {
      const approved = baseline.files.find(file => file.path === path);
      expect(approved, `Unreviewed brazier asset routed into the game: ${path}`).toBeDefined();
      const bytes = readFileSync(resolve('public', path.slice(1)));
      expect(createHash('sha256').update(bytes).digest('hex'), `Brazier baseline changed: ${path}`).toBe(approved!.sha256);
    }
  }
});
