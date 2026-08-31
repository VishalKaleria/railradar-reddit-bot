import { sanitizeInline } from '../text.js';
import { formatDuration } from '../time.js';
import type { TrainBetweenStations, TrainsBetween } from '../types.js';
import {
  footer,
  formatClock,
  formatDayOffset,
  formatRunDays,
  formatStation,
} from './shared.js';

/**
 * Render a station-to-station train search.
 * Truncated to keep the reply scannable on a phone.
 */

const MAX_TRAIN_ROWS = 8;

export type BetweenRenderOptions = {
  /**
   * True when the search was expanded across a metropolitan area. Individual
   * trains may then board or alight at a different station than the headline,
   * so those codes must be shown or the times would be misleading.
   */
  byCity: boolean;
};

/**
 * Render a time cell, appending the actual station code when it differs from
 * the headline station.
 */
function timeCell(
  time: string | null | undefined,
  actualCode: string | undefined,
  headlineCode: string | undefined,
  suffix = ''
): string {
  const base = `${formatClock(time)}${suffix}`;
  if (!actualCode || !headlineCode) return base;

  const actual = actualCode.toUpperCase();
  if (actual === headlineCode.toUpperCase()) return base;

  return `${base} @${sanitizeInline(actual, 10)}`;
}

function trainRow(
  entry: TrainBetweenStations,
  fromCode: string | undefined,
  toCode: string | undefined
): string {
  const number = sanitizeInline(entry.train.number, 8);
  const name = sanitizeInline(entry.train.name, 26);
  const departure = timeCell(entry.from.departure, entry.from.code, fromCode);
  const arrival = timeCell(
    entry.to.arrival,
    entry.to.code,
    toCode,
    formatDayOffset(entry.from.day, entry.to.day)
  );
  const duration = formatDuration(entry.duration) ?? '\u2014';
  const runDays = formatRunDays(entry.train.runDays);

  return `| ${number} ${name} | ${departure} | ${arrival} | ${duration} | ${runDays} |`;
}

export function renderBetween(
  data: TrainsBetween,
  date: string | undefined,
  options: BetweenRenderOptions = { byCity: false }
): string {
  const heading = `**${formatStation(data.from)} \u2192 ${formatStation(data.to)}**`;
  const lines: string[] = [heading, ''];

  if (data.trains.length === 0) {
    lines.push(
      date
        ? `No direct trains found for ${date}.`
        : 'No direct trains found between these stations.'
    );
    lines.push('');
    lines.push(footer([]));
    return lines.join('\n');
  }

  const countLine = date
    ? `${data.count} direct train(s) on ${date}`
    : `${data.count} direct train(s)`;
  lines.push(
    options.byCity ? `${countLine} \u00b7 city-wide search` : countLine
  );
  lines.push('');

  lines.push('| Train | Dep | Arr | Duration | Runs |');
  lines.push('|---|---|---|---|---|');

  for (const entry of data.trains.slice(0, MAX_TRAIN_ROWS)) {
    lines.push(trainRow(entry, data.from?.code, data.to?.code));
  }

  if (data.trains.length > MAX_TRAIN_ROWS) {
    lines.push('');
    lines.push(`_Showing ${MAX_TRAIN_ROWS} of ${data.trains.length}._`);
  }

  if (options.byCity) {
    lines.push('');
    lines.push(
      '_`@CODE` marks a different station in the same city than the one you named._'
    );
  }

  lines.push('');
  lines.push(footer(['details: !train <number>']));

  return lines.join('\n');
}
