// Guard rail against writing the same thing twice (a double click, a double
// tap, a form submitted by Enter and the button at once). Every exported
// write that creates a new document goes through `guardWrite`:
//   - while a call is in flight, an identical call (same write, same
//     arguments) gets the same promise instead of writing again;
//   - for REPEAT_WINDOW_MS after it succeeds, an identical call gets the
//     same result (the id already written) instead of a second document.
// A failed write is forgotten at once, so trying again really retries.
// Calls with different arguments are never merged.

const REPEAT_WINDOW_MS = 3000;

const inFlight = new Map<string, Promise<unknown>>();
const recent = new Map<string, { at: number; value: unknown }>();

/** A stable key for a write's arguments (Dates, Maps and Sets included). */
function keyOf(name: string, args: unknown[]): string {
  const seen = new WeakSet<object>();
  const json = JSON.stringify(args, function (this: unknown, k, v) {
    const raw = this && typeof this === 'object' ? (this as Record<string, unknown>)[k] : v;
    if (raw instanceof Date) return { $date: raw.getTime() };
    if (typeof v === 'function') return undefined;
    if (v instanceof Map) return { $map: [...v.entries()] };
    if (v instanceof Set) return { $set: [...v.values()] };
    if (v && typeof v === 'object') {
      if (seen.has(v)) return '$cycle';
      seen.add(v);
      if (!Array.isArray(v)) {
        // Key order shouldn't make two identical writes look different.
        return Object.fromEntries(Object.keys(v).sort().map((key) => [key, (v as Record<string, unknown>)[key]]));
      }
    }
    return v;
  });
  return `${name}:${json}`;
}

export function guardWrite<A extends unknown[], R>(name: string, write: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return (...args: A) => {
    const key = keyOf(name, args);
    const now = Date.now();
    for (const [k, r] of recent) if (now - r.at > REPEAT_WINDOW_MS) recent.delete(k);

    const done = recent.get(key);
    if (done) return Promise.resolve(done.value as R);
    const running = inFlight.get(key);
    if (running) return running as Promise<R>;

    const p = write(...args).then(
      (value) => {
        inFlight.delete(key);
        recent.set(key, { at: Date.now(), value });
        return value;
      },
      (error: unknown) => {
        inFlight.delete(key);
        throw error;
      }
    );
    inFlight.set(key, p);
    return p;
  };
}
