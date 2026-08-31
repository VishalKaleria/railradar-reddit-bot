import { sanitizeInline } from '../text.js';
import { formatDuration } from '../time.js';
import type { StaticRouteStop, TrainDetails } from '../types.js';
import {
  footer,
  formatClock,
  formatRunDays,
  formatStation,
  formatTrainLabel,
} from './shared.js';

/**
 * Render the static train profile and timetable.
 *
 * A full route can exceed 40 stops, which is unreadable on mobile, so the halt
 * list is truncated and the destination is always kept.
 */

const MAX_HALT_ROWS = 8;

function haltRow(stop: StaticRouteStop): string {
  const station = formatStation(stop.station);
  const distance =
    typeof stop.distance === 'number'
      ? String(Math.round(stop.distance))
      : '\u2014';

  return `| ${station} | ${formatClock(stop.arrival)} | ${formatClock(stop.departure)} | ${distance} |`;
}

export function renderTrain(details: TrainDetails): string {
  const { train, route } = details;
  const lines: string[] = [
    `**${formatTrainLabel(train.number, train.name)}**`,
    '',
  ];

  const classification = [
    train.type ? sanitizeInline(train.type, 24) : undefined,
    formatRunDays(train.runDays),
  ].filter((part): part is string => Boolean(part));

  lines.push(
    `\u{1f6a9} ${formatStation(train.source)} \u2192 ${formatStation(train.destination)}`
  );
  lines.push(`\u{1f5c2}\ufe0f ${classification.join(' \u00b7 ')}`);

  // Vital statistics; each is optional upstream so build the list defensively.
  const stats: string[] = [];
  if (typeof train.distance === 'number')
    stats.push(`${Math.round(train.distance)} km`);
  const duration = formatDuration(train.duration);
  if (duration) stats.push(duration);
  if (typeof train.avgSpeed === 'number')
    stats.push(`avg ${Math.round(train.avgSpeed)} km/h`);
  if (typeof train.maxSpeed === 'number')
    stats.push(`max ${Math.round(train.maxSpeed)} km/h`);
  if (stats.length > 0) {
    lines.push(`\u{1f4cf} ${stats.join(' \u00b7 ')}`);
  }

  const halts = route.filter((stop) => stop.isHalt);
  if (halts.length > 0) {
    const shown = halts.slice(0, MAX_HALT_ROWS);
    const truncated = halts.length > shown.length;
    const destination = halts[halts.length - 1];

    lines.push('');
    lines.push(`**Halts** (${halts.length} total)`);
    lines.push('');
    lines.push('| Station | Arr | Dep | Km |');
    lines.push('|---|---|---|---|');

    for (const stop of shown) {
      lines.push(haltRow(stop));
    }

    // Keep the destination visible even when the middle is cut.
    if (truncated && destination && !shown.includes(destination)) {
      lines.push('| \u2026 | | | |');
      lines.push(haltRow(destination));
    }
  }

  lines.push('');
  lines.push(footer([`live status: !live ${train.number}`]));

  return lines.join('\n');
}
