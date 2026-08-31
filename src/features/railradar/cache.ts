import { redis } from '@devvit/web/server';

/**
 * Cache TTLs in seconds, tuned per data volatility.
 *
 * These exist to protect the RailRadar API bill in a 400k-member subreddit.
 * Live data stays short so the bot never shows stale positions; static
 * timetables and lookup dictionaries are cached aggressively.
 */
export const CACHE_TTL = {
  /** Live running status moves constantly. */
  live: 90,
  /** Timetables change rarely. */
  schedule: 60 * 60 * 24,
  /** Station/train name resolution is effectively static. */
  lookup: 60 * 60 * 24 * 7,
  /** Trains-between results are static per day. */
  between: 60 * 60 * 6,
  /** PNR status can change at any time; cache only to absorb duplicates. */
  pnr: 60,
  /** Confirmation predictions move slowly. */
  prediction: 60 * 30,
} as const;

/** Namespace prefix; the `v1` segment allows a clean cache invalidation later. */
const PREFIX = 'railradar:v1';

export function cacheKey(...parts: (string | number)[]): string {
  return [PREFIX, ...parts].join(':');
}

/**
 * Read-through cache. A cache failure never fails the request: on any Redis or
 * parse problem the fetcher runs and the result is still returned.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  try {
    const raw = await redis.get(key);
    if (raw) {
      return JSON.parse(raw) as T;
    }
  } catch (error) {
    // Corrupt entry or Redis read failure: fall through and refetch.
    console.warn(`[railradar] cache read failed for ${key}`, error);
  }

  const value = await fetcher();

  try {
    await redis.set(key, JSON.stringify(value));
    await redis.expire(key, ttlSeconds);
  } catch (error) {
    // Storage quota or transient failure must not break a working reply.
    console.warn(`[railradar] cache write failed for ${key}`, error);
  }

  return value;
}
