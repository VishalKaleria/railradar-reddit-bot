import { sanitizeInline, titleCase } from '../text.js';
import type { StationRef } from '../types.js';

/**
 * Shared presentation helpers.
 *
 * Replies are written mobile-first: a bold headline, the one number that
 * matters, then supporting detail. Long lists are always truncated.
 */

/** Attribution shown on every reply. Kept to a single quiet line. */
export const ATTRIBUTION = 'Train data by RailRadar';

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Format a delay in minutes as human text. */
export function formatDelay(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return 'delay unknown';
  }

  const value = Math.trunc(minutes);
  if (value === 0) return 'on time';

  const magnitude = Math.abs(value);
  const suffix = value < 0 ? 'early' : 'late';

  if (magnitude < 60) return `${magnitude} min ${suffix}`;

  const hours = Math.floor(magnitude / 60);
  const mins = magnitude % 60;
  return mins === 0 ? `${hours}h ${suffix}` : `${hours}h ${mins}m ${suffix}`;
}

/** Traffic-light indicator matching the delay severity. */
export function delayIndicator(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return '\u26aa';
  }
  if (minutes <= 0) return '\u{1f7e2}';
  if (minutes < 15) return '\u{1f7e1}';
  return '\u{1f534}';
}

/** Render run days compactly: `Daily` or `Mon, Wed, Fri`. */
export function formatRunDays(runDays: readonly string[] | undefined): string {
  if (!runDays || runDays.length === 0) return 'run days unknown';

  const normalized = runDays.map((day) => day.slice(0, 3).toLowerCase());
  const active = DAY_ORDER.filter((day) => normalized.includes(day));

  if (active.length === 0) return 'run days unknown';
  if (active.length === 7) return 'Daily';

  return active.map((day) => titleCase(day)).join(', ');
}

/** Render a station as `Name (CODE)`, tolerating missing names. */
export function formatStation(station: StationRef | undefined): string {
  if (!station) return 'unknown';

  const code = sanitizeInline(station.code, 12).toUpperCase();
  const name = station.name ? sanitizeInline(station.name, 40) : '';

  return name ? `${name} (${code})` : code;
}

/** Render `12951 Mumbai Rajdhani` style train label. */
export function formatTrainLabel(
  number: string,
  name: string | null | undefined
): string {
  const safeNumber = sanitizeInline(number, 8);
  if (!name) return safeNumber;
  return `${safeNumber} ${sanitizeInline(name, 48)}`;
}

/** Show a `+1` style day offset, or empty string for same-day. */
export function formatDayOffset(fromDay: number, toDay: number): string {
  const offset = toDay - fromDay;
  if (!Number.isFinite(offset) || offset <= 0) return '';
  return ` (+${offset})`;
}

/**
 * Render a scheduled `HH:MM` clock value from the API, or an em dash when the
 * stop has no time (origin has no arrival, destination has no departure).
 */
export function formatClock(value: string | null | undefined): string {
  if (!value) return '\u2014';
  return sanitizeInline(value, 8);
}

/**
 * Build the reply footer.
 *
 * `hints` teach the next command, which is the main discovery mechanism for the
 * bot. Because these hints contain literal `!commands`, the trigger handler must
 * ignore comments authored by the app itself or the bot would answer its own
 * footers forever.
 */
export function footer(hints: readonly string[] = []): string {
  const parts = [...hints, ATTRIBUTION];
  return `^(${parts.join(' \u00b7 ')})`;
}
