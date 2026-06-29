import { setJSON } from './storage';

export interface DebouncedWriter {
  /** Queue a value to persist; coalesces rapid calls into one write after the quiet window. */
  write: (value: unknown) => void;
  /** Persist any pending value immediately (e.g. on app background or provider unmount). */
  flush: () => void;
}

/**
 * Coalesces rapid writes to one storage key into a single debounced JSON write, so
 * an upgrade spray (or any burst of mutations) does ONE JSON.stringify + disk write
 * after the burst settles instead of one per tap. The big home roster serializes to
 * tens of kilobytes, so stringifying it on every upgrade tap stalls the JS thread;
 * debouncing keeps the UI responsive while the spray is in progress.
 *
 * The owner must call flush() on app background and on unmount so an in-flight value
 * is never lost (see the context providers). State updates stay immediate; only the
 * persistence is deferred, so the UI never waits on a write.
 */
export function createDebouncedWriter(key: string, delayMs = 500): DebouncedWriter {
  let pending: unknown;
  let hasPending = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (!hasPending) return;
    hasPending = false;
    const value = pending;
    pending = undefined;
    void setJSON(key, value);
  };

  const write = (value: unknown) => {
    pending = value;
    hasPending = true;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
  };

  return { write, flush };
}
