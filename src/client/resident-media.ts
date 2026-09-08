export type ResidentKey = 'queen' | 'medium';

/** Original authored repertoire restored from morning build e836ec3. */
export function parlorResidentMedia(key: ResidentKey) {
  const base = `/video/parlor-maidens-v1/${key}`;
  return {
    idle: `${base}-idle.webm`,
    reaction: key === 'medium' ? '/video/rare-features-v4/medium-reaction.webm' : `${base}-reaction.webm`,
    characterIdle: `${base}-${key === 'queen' ? 'listen' : 'whisper'}.webm`,
    alternate: `${base}-alternate.webm`,
    quietVariants: (key === 'queen' ? ['queen-fringe', 'queen-shiver'] : ['medium-turn', 'medium-neck'])
      .map(name => `/video/parlor-idles-v2/${name}.webm`),
  };
}
