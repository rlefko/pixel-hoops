/**
 * Web implementation of the key-value JSON store, backed by localStorage. Guards
 * `typeof localStorage` so the static web prerender (Node, no localStorage) is a
 * no-op rather than a crash. Same API as the native `storage.ts`.
 */

function store(): Storage | null {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

export async function getJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = store()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function setJSON(key: string, value: unknown): Promise<void> {
  try {
    store()?.setItem(key, JSON.stringify(value));
  } catch {
    /* best-effort */
  }
}

export async function remove(key: string): Promise<void> {
  try {
    store()?.removeItem(key);
  } catch {
    /* best-effort */
  }
}
