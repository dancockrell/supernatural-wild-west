export type ResidentKey = 'queen' | 'medium';

/** One admitted, effect-free family for every resident playback and poster. */
export function parlorResidentMedia(key: ResidentKey) {
  const base = `/video/parlor-women-solid-v2/${key}`;
  return {
    idle: `${base}-idle.webm`,
    reaction: `${base}-reaction.webm`,
    characterIdle: `${base}-character-idle.webm`,
    alternate: `${base}-alternate.webm`,
    quietVariants: (key === 'queen' ? ['fringe', 'shiver'] : ['turn', 'neck'])
      .map(action => `${base}-${action}.webm`),
  };
}
