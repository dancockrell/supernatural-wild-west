export type ResidentKey = 'queen' | 'medium';

/** Change an admitted family here so room, reels and features keep one identity. */
export function parlorResidentMedia(key: ResidentKey) {
  const family = 'parlor-residents-color-v8';
  return {
    idle: `/video/${family}/${key}-idle.webm`,
    reaction: `/video/${family}/${key}-reaction.webm`,
    characterIdle: `/video/${family}/${key === 'queen' ? 'queen-listen' : 'medium-whisper'}.webm`,
    alternate: `/video/${family}/${key}-alternate.webm`,
  };
}
