export type DemoStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Keep this page playable when browser privacy settings or quotas deny storage. */
export function createSafeStorage(getStorage: () => DemoStorage): DemoStorage {
  const memory = new Map<string, string>();
  let unavailable = false;
  return {
    getItem(key) {
      if (!unavailable) {
        try {
          const value = getStorage().getItem(key);
          if (value === null) memory.delete(key);
          else memory.set(key, value);
          return value;
        } catch {
          unavailable = true;
        }
      }
      return memory.get(key) ?? null;
    },
    setItem(key, value) {
      memory.set(key, value);
      if (!unavailable) {
        try {
          getStorage().setItem(key, value);
        } catch {
          unavailable = true;
        }
      }
    },
    removeItem(key) {
      memory.delete(key);
      if (!unavailable) {
        try {
          getStorage().removeItem(key);
        } catch {
          unavailable = true;
        }
      }
    },
  };
}

export const storage = createSafeStorage(() => localStorage);
export const PUBLIC_PENDING_KEY = "sww-public-demo-pending-v1";
