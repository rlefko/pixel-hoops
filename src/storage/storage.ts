import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Tiny async key-value JSON store (native). The web build resolves the sibling
 * `storage.web.ts` instead (Metro platform resolution), so AsyncStorage is never
 * imported on web and the `expo export --platform web` prerender stays safe.
 * All calls are best-effort: failures resolve to a safe default rather than throw.
 */

export async function getJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function setJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* best-effort */
  }
}

export async function remove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    /* best-effort */
  }
}
