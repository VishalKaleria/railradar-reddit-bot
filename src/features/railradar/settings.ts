import { settings } from '@devvit/web/server';
import { RailRadarError } from './errors.js';

export type RailRadarSettings = {
  /** Master switch for the whole feature. */
  enabled: boolean;
  /** Separate switch so mods can keep train info but disable PNR lookups. */
  pnrEnabled: boolean;
  /** Minimum seconds between two commands from the same user. */
  cooldownSeconds: number;
  /** Maximum bot replies allowed under a single post. */
  maxRepliesPerPost: number;
  /** Subreddit-wide daily reply ceiling; acts as a cost circuit breaker. */
  dailyLimit: number;
};

export const SETTINGS_DEFAULTS: RailRadarSettings = {
  enabled: true,
  pnrEnabled: true,
  cooldownSeconds: 0,
  maxRepliesPerPost: 10,
  dailyLimit: 2000,
};

/**
 * Coerce a moderator-provided setting into a bounded integer.
 * Pure and exported so limits are unit tested rather than trusted.
 */
export function coerceBoundedInt(
  raw: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number.parseInt(raw.trim(), 10)
        : Number.NaN;

  if (!Number.isFinite(parsed)) return fallback;

  // Truncate first so fractional input cannot slip past the bounds.
  const asInt = Math.trunc(parsed);
  if (asInt < min) return min;
  if (asInt > max) return max;
  return asInt;
}

export async function getRailRadarSettings(): Promise<RailRadarSettings> {
  // Read all settings in parallel; mod changes take effect on the next event.
  const [enabled, pnrEnabled, cooldown, perPost, daily] = await Promise.all([
    settings.get<boolean>('railradarEnabled'),
    settings.get<boolean>('railradarPnrEnabled'),
    settings.get<number>('railradarCooldownSeconds'),
    settings.get<number>('railradarMaxRepliesPerPost'),
    settings.get<number>('railradarDailyLimit'),
  ]);

  return {
    enabled: Boolean(enabled),
    // Defaults to enabled so a fresh install keeps PNR unless mods opt out.
    pnrEnabled:
      pnrEnabled === undefined
        ? SETTINGS_DEFAULTS.pnrEnabled
        : Boolean(pnrEnabled),
    cooldownSeconds: coerceBoundedInt(
      cooldown,
      SETTINGS_DEFAULTS.cooldownSeconds,
      0,
      3600
    ),
    maxRepliesPerPost: coerceBoundedInt(
      perPost,
      SETTINGS_DEFAULTS.maxRepliesPerPost,
      1,
      200
    ),
    dailyLimit: coerceBoundedInt(
      daily,
      SETTINGS_DEFAULTS.dailyLimit,
      1,
      100000
    ),
  };
}

/**
 * Read the RailRadar API key from global app secrets.
 * Throws a CONFIG error so the caller can tell users the bot needs setup
 * instead of showing a generic failure.
 */
export async function getRailRadarApiKey(): Promise<string> {
  const key = await settings.get<string>('railradarApiKey');
  const trimmed = typeof key === 'string' ? key.trim() : '';

  if (!trimmed) {
    throw new RailRadarError(
      'CONFIG',
      'This bot is not configured correctly yet. A moderator needs to set the RailRadar API key.',
      'railradarApiKey secret is empty or unset'
    );
  }

  return trimmed;
}
