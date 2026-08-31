import { redis } from '@devvit/web/server';
import { istDateKey } from './time.js';

/**
 * Abuse and cost controls.
 *
 * Three independent limits:
 *  - per-user cooldown  : stops one user spamming commands
 *  - per-post cap       : stops a single thread filling with bot replies
 *  - subreddit daily cap: circuit breaker protecting the API bill
 */

export type LimitReason = 'cooldown' | 'post-cap' | 'daily-cap';

export type LimitDecision =
  | { allowed: true }
  | { allowed: false; reason: LimitReason };

export type LimitOptions = {
  username: string;
  postId: string;
  cooldownSeconds: number;
  maxRepliesPerPost: number;
  dailyLimit: number;
};

const COOLDOWN_PREFIX = 'railradar:cooldown';
const POST_COUNT_PREFIX = 'railradar:postcount';
const DAILY_COUNT_PREFIX = 'railradar:daily';

// Post counters outlive active discussion but should not accumulate forever.
const POST_COUNT_TTL_SECONDS = 60 * 60 * 24 * 14;
// Keep two days so a rollover at midnight IST cannot lose the active counter.
const DAILY_COUNT_TTL_SECONDS = 60 * 60 * 48;

/** Decide whether a count is already at or above its ceiling. */
export function isOverLimit(current: number, limit: number): boolean {
  return current >= limit;
}

function parseCount(raw: string | undefined | null): number {
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Check all limits and, when allowed, consume quota.
 *
 * Counters are read before being incremented so a request rejected by one limit
 * does not inflate the others.
 */
export async function checkAndConsume(
  options: LimitOptions
): Promise<LimitDecision> {
  const cooldownKey = `${COOLDOWN_PREFIX}:${options.username}`;
  const postKey = `${POST_COUNT_PREFIX}:${options.postId}`;
  const dailyKey = `${DAILY_COUNT_PREFIX}:${istDateKey()}`;

  // 1. Cooldown is a pure read, so it never consumes quota.
  if (options.cooldownSeconds > 0) {
    const onCooldown = await redis.exists(cooldownKey);
    if (onCooldown) {
      return { allowed: false, reason: 'cooldown' };
    }
  }

  // 2. Read both counters before mutating anything.
  const [postRaw, dailyRaw] = await redis.mGet([postKey, dailyKey]);

  if (isOverLimit(parseCount(dailyRaw), options.dailyLimit)) {
    return { allowed: false, reason: 'daily-cap' };
  }

  if (isOverLimit(parseCount(postRaw), options.maxRepliesPerPost)) {
    return { allowed: false, reason: 'post-cap' };
  }

  // 3. All checks passed: consume quota.
  const nextPostCount = await redis.incrBy(postKey, 1);
  if (nextPostCount === 1) {
    await redis.expire(postKey, POST_COUNT_TTL_SECONDS);
  }

  const nextDailyCount = await redis.incrBy(dailyKey, 1);
  if (nextDailyCount === 1) {
    await redis.expire(dailyKey, DAILY_COUNT_TTL_SECONDS);
  }

  if (options.cooldownSeconds > 0) {
    await redis.set(cooldownKey, '1');
    await redis.expire(cooldownKey, options.cooldownSeconds);
  }

  return { allowed: true };
}
