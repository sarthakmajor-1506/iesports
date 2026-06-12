/**
 * Tiny stale-while-revalidate client cache for page data.
 *
 * Pages that fetch JSON on mount (tournament detail, etc.) re-fetch from scratch
 * on every navigation / back-button, showing a loading spinner each time even
 * though the data was just loaded. This caches the last response in-memory (fast)
 * with a sessionStorage backup (survives full reloads + back/forward within the
 * tab). Pages read the cache synchronously to render instantly, then refetch in
 * the background and overwrite — so the view is instant AND eventually fresh.
 */
type Entry = { data: any; at: number };
const mem = new Map<string, Entry>();
const PREFIX = "iesPageCache:";

export function readCache<T = any>(key: string): T | null {
  let e = mem.get(key);
  if (!e && typeof window !== "undefined") {
    try {
      const s = window.sessionStorage.getItem(PREFIX + key);
      if (s) { e = JSON.parse(s) as Entry; if (e) mem.set(key, e); }
    } catch { /* sessionStorage unavailable / parse error */ }
  }
  return e ? (e.data as T) : null;
}

export function writeCache(key: string, data: any): void {
  const e: Entry = { data, at: Date.now() };
  mem.set(key, e);
  if (typeof window !== "undefined") {
    try { window.sessionStorage.setItem(PREFIX + key, JSON.stringify(e)); }
    catch { /* quota exceeded — in-memory still works for this session */ }
  }
}

/** Age of a cached entry in ms, or Infinity if absent. */
export function cacheAge(key: string): number {
  const e = mem.get(key);
  return e ? Date.now() - e.at : Infinity;
}
