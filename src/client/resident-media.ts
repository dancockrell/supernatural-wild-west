export type ResidentKey = 'queen' | 'medium';

/** Authored lantern acting; clean artwork until a brazier performance passes review. */
export function parlorResidentMedia(key: ResidentKey) {
  const base = `/video/${key === 'queen' ? 'parlor-women-authored-v1' : 'parlor-women-solid-v2'}/${key}`;
  return {
    idle: `${base}-idle.webm`,
    reaction: `${base}-reaction.webm`,
    characterIdle: `${base}-character-idle.webm`,
    alternate: `${base}-alternate.webm`,
    quietVariants: [] as string[],
  };
}
