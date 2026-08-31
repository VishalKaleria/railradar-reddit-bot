import { reddit, redis } from '@devvit/web/server';
import type { OnCommentSubmitRequest, T1 } from '@devvit/web/shared';
import { dispatchCommand } from './commands/index.js';
import { claimComment } from './idempotency.js';
import { parseCommand } from './parse.js';
import { checkAndConsume } from './ratelimit.js';
import { getRailRadarSettings } from './settings.js';

/**
 * Comment trigger entry point for the RailRadar bot.
 *
 * Guards run cheapest-first so the overwhelming majority of comments (which
 * contain no command) exit before touching Redis, settings or the network.
 */

// Devvit event IDs may arrive with or without the fullname prefix.
function asT1(id: string): T1 {
  return (id.startsWith('t1_') ? id : `t1_${id}`) as T1;
}

const APP_USERNAME_KEY = 'railradar:appUsername';
const APP_USERNAME_TTL_SECONDS = 60 * 60 * 24;

/**
 * Whether a comment was authored by this app.
 *
 * Pure so the recursion rule can be unit tested. Returns true (i.e. "treat as
 * ours, do not reply") whenever authorship cannot be established, because
 * replying to an unknown author risks an infinite self-reply loop.
 */
export function isSelfAuthored(
  authorName: string | undefined,
  appUsername: string | undefined
): boolean {
  if (!authorName || authorName === '[deleted]') return true;
  // Fail safe: without a known app username we cannot prove this is not us.
  if (!appUsername) return true;

  return authorName.toLowerCase() === appUsername.toLowerCase();
}

/**
 * Resolve this app's own account name, cached in Redis.
 *
 * Needed because bot replies contain literal `!command` hints in their footer.
 * Without this guard the bot would parse its own reply and answer itself in an
 * infinite loop, which the Devvit trigger docs explicitly warn about.
 */
async function getAppUsername(): Promise<string | undefined> {
  try {
    const cachedName = await redis.get(APP_USERNAME_KEY);
    if (cachedName) return cachedName;
  } catch (error) {
    console.warn('[railradar] app username cache read failed', error);
  }

  const appUser = await reddit.getAppUser();
  const username = appUser?.username;

  if (username) {
    try {
      await redis.set(APP_USERNAME_KEY, username);
      await redis.expire(APP_USERNAME_KEY, APP_USERNAME_TTL_SECONDS);
    } catch (error) {
      console.warn('[railradar] app username cache write failed', error);
    }
  }

  return username;
}

export async function handleCommentSubmitRailRadar(
  input: OnCommentSubmitRequest
): Promise<void> {
  const body = input.comment?.body;
  const commentId = input.comment?.id;
  const postId = input.post?.id;
  const authorName = input.author?.name;

  if (!body || !commentId || !postId) return;

  // 1. Pure string parse: no I/O, filters out nearly every comment.
  const command = parseCommand(body);
  if (!command) return;

  // 2. Feature toggle, so a disabled install does no further work.
  const settings = await getRailRadarSettings();
  if (!settings.enabled) return;

  // 3. Recursion guard: never react to our own comments. Fails safe - if the
  //    app username cannot be resolved, we skip rather than risk a reply loop.
  if (!authorName || authorName === '[deleted]') return;

  const appUsername = await getAppUsername();
  if (isSelfAuthored(authorName, appUsername)) {
    if (!appUsername) {
      console.warn(
        '[railradar] app username unresolved; skipping to avoid a self-reply loop'
      );
    }
    return;
  }

  // 4. Triggers can fire more than once per event; claim this comment exactly once.
  const claimed = await claimComment(commentId);
  if (!claimed) return;

  // 5. Abuse and cost controls.
  const decision = await checkAndConsume({
    username: authorName,
    postId,
    cooldownSeconds: settings.cooldownSeconds,
    maxRepliesPerPost: settings.maxRepliesPerPost,
    dailyLimit: settings.dailyLimit,
  });

  if (!decision.allowed) {
    // Staying silent is deliberate: replying "you are rate limited" to every
    // blocked command would itself be spam.
    console.log(`[railradar] skipped ${command.kind}: ${decision.reason}`);
    return;
  }

  // 6. Execute and reply as the app account.
  const reply = await dispatchCommand(command, {
    pnrEnabled: settings.pnrEnabled,
  });

  if (!reply.trim()) return;

  const comment = await reddit.getCommentById(asT1(commentId));
  await comment.reply({ text: reply, runAs: 'APP' });
}
