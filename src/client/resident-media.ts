export type ResidentKey = 'queen' | 'medium';

/** Four native performances per resident, with matched full-body canvases. */
export function parlorResidentMedia(key: ResidentKey) {
  const base = `/video/parlor-women-authored-v1/${key}`;
  return {
    idle: `${base}-idle.webm`,
    reaction: `${base}-reaction.webm`,
    characterIdle: `${base}-character-idle.webm`,
    alternate: `${base}-alternate.webm`,
    quietVariants: [] as string[],
  };
}
