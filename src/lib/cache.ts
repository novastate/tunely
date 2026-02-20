/**
 * Simple in-memory TTL cache for API responses.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
}, 300_000);

/**
 * Get or set a cached value.
 * @param key Cache key
 * @param ttlMs Time-to-live in milliseconds
 * @param fn Function to compute value on cache miss
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const existing = store.get(key) as CacheEntry<T> | undefined;

  if (existing && now < existing.expiresAt) {
    return existing.data;
  }

  const data = await fn();
  store.set(key, { data, expiresAt: now + ttlMs });
  return data;
}

/** Cache TTL constants */
export const TTL = {
  LASTFM_SIMILAR: 24 * 60 * 60 * 1000,    // 24h - similar artists rarely change
  LASTFM_TOP_TRACKS: 12 * 60 * 60 * 1000, // 12h
  LASTFM_CHARTS: 60 * 60 * 1000,          // 1h
  SPOTIFY_CHARTS: 60 * 60 * 1000,          // 1h
  SPOTIFY_SEARCH: 30 * 60 * 1000,          // 30min - artist search results
} as const;
