import { redis } from '@devvit/web/server';
import { istDateKey } from './time.js';

/**
 * Trigger de-duplication.
 *
 * Devvit explicitly does not guarantee once-only trigger delivery, so without
 * this the bot would post duplicate replies for a single comment.
 *
 * Uses hSetNX, which is atomic: only the first caller for a given comment id
 * gets the claim, even if two invocations race.
 */

const SEEN_PREFIX = 'railradar:seen';
// Keep two days of history so a retry after midnight IST is still recognised.
const SEEN_TTL_SECONDS = 60 * 60 * 48;

/**
 * Attempt to claim exclusive processing rights for a comment.
 * Returns true for the first caller and false for every duplicate.
 */
export async function claimComment(commentId: string): Promise<boolean> {
  const key = `${SEEN_PREFIX}:${istDateKey()}`;

  try {
    // hSetNX returns 1 when the field was created, 0 when it already existed.
    const created = await redis.hSetNX(key, commentId, '1');
    if (created !== 1) {
      return false;
    }

    await redis.expire(key, SEEN_TTL_SECONDS);
    return true;
  } catch (error) {
    // If the de-dupe store is unavailable, prefer answering the user once over
    // failing entirely. A rare duplicate reply is better than silence.
    console.warn('[railradar] idempotency check failed', error);
    return true;
  }
}
