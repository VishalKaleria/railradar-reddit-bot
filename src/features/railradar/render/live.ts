import { sanitizeInline } from '../text.js';
import { istHhMm, istHhMmShifted } from '../time.js';
import type { LiveRouteStop, LiveTrain } from '../types.js';
import {
  delayIndicator,
  footer,
  formatDelay,
  formatStation,
  formatTrainLabel,
} from './shared.js';

/**
 * Render live running status.
 *
 * Priorities, in order: is it late, where is it, when does it reach the next
 * halt. Everything else is secondary.
 */

function findStopBySequence(
  route: readonly LiveRouteStop[],
  sequence: number | undefined
): LiveRouteStop | undefined {
  if (sequence === undefined) return undefined;
  return route.find((stop) => stop.sequence === sequence);
}

/**
 * Resolve a display name for a station code.
 *
 * The current location must be named from its own `stationCode`. Using
 * `previousHalt` for this is wrong when the train is standing at a station:
 * it would render "At <previous station>" while the code says otherwise.
 */
function stationNameForCode(data: LiveTrain, code: string): string {
  const stop = data.route.find((entry) => entry.stationCode === code);
  if (stop?.stationName) return sanitizeInline(stop.stationName, 40);

  if (data.previousHalt?.stationCode === code) {
    return sanitizeInline(data.previousHalt.stationName, 40);
  }

  if (data.nextHalt?.stationCode === code) {
    return sanitizeInline(data.nextHalt.stationName, 40);
  }

  return sanitizeInline(code, 12);
}

function headlineStatus(data: LiveTrain): string {
  switch (data.status) {
    case 'not-started':
      return 'not started yet';
    case 'completed':
      return 'journey completed';
    case 'cancelled':
      return 'CANCELLED';
    case 'running':
    default:
      return formatDelay(data.delayMinutes);
  }
}

export function renderLive(data: LiveTrain): string {
  const label = formatTrainLabel(data.trainNumber, data.trainName);
  const indicator =
    data.status === 'cancelled'
      ? '\u{1f6ab}'
      : delayIndicator(data.status === 'running' ? data.delayMinutes : 0);

  const lines: string[] = [
    `**${label}** \u2014 ${indicator} ${headlineStatus(data)}`,
    '',
  ];

  // Route endpoints give useful orientation regardless of running state.
  lines.push(
    `\u{1f6a9} ${formatStation(data.train.source)} \u2192 ${formatStation(data.train.destination)}`
  );

  if (data.status === 'running') {
    const location = data.currentLocation;

    if (location) {
      // Name the station from the location's own code, not from previousHalt.
      const stationName = stationNameForCode(data, location.stationCode);
      const verb = location.status === 'at-station' ? 'At' : 'Departed';

      const details: string[] = [];
      if (typeof location.speedKmh === 'number' && location.speedKmh > 0) {
        details.push(`${Math.round(location.speedKmh)} km/h`);
      }

      lines.push(
        details.length > 0
          ? `\u{1f4cd} ${verb} ${stationName} \u00b7 ${details.join(' \u00b7 ')}`
          : `\u{1f4cd} ${verb} ${stationName}`
      );
    }

    const nextHalt = data.nextHalt;
    if (nextHalt) {
      const stop = findStopBySequence(data.route, nextHalt.sequence);
      const delay =
        typeof stop?.delayArrival === 'number' ? stop.delayArrival : 0;

      // Show the time the train is actually expected, not the timetable time.
      const expected =
        delay > 0
          ? istHhMmShifted(stop?.scheduledArrival, delay)
          : istHhMm(stop?.scheduledArrival);

      const etaText = expected
        ? delay > 0
          ? `${expected} (${formatDelay(delay)})`
          : expected
        : 'time unavailable';

      const platform = stop?.platform
        ? ` \u00b7 PF ${sanitizeInline(stop.platform, 6)}`
        : '';

      lines.push(
        `\u23ed\ufe0f Next halt: ${sanitizeInline(nextHalt.stationName, 40)} \u2014 ETA ${etaText}${platform}`
      );
    }

    // Progress along the route, when both numbers are available.
    const travelled = data.currentLocation?.distanceFromOriginKm;
    const total = data.train.distance;
    if (
      typeof travelled === 'number' &&
      typeof total === 'number' &&
      total > 0
    ) {
      lines.push(
        `\u{1f6e4}\ufe0f ${Math.round(travelled)} of ${Math.round(total)} km covered`
      );
    }
  } else if (data.status === 'not-started') {
    const first = data.route[0];
    const departure = istHhMm(first?.scheduledDeparture);
    if (departure) {
      lines.push(
        `\u{1f552} Scheduled departure ${departure} on ${data.startDate}`
      );
    }
  }

  // Cancellations, diversions and reschedules matter more than delay.
  const exceptions = data.exceptions ?? [];
  if (exceptions.length > 0) {
    lines.push('');
    for (const exception of exceptions.slice(0, 2)) {
      lines.push(`\u26a0\ufe0f ${sanitizeInline(exception.message, 160)}`);
    }
  }

  // Be explicit when this is not a real live feed. Presenting estimates as live
  // data destroys trust the first time it is wrong.
  if (!data.isLive || data.trackingMode !== 'real-time') {
    lines.push('');
    lines.push(
      '_Estimated from the timetable \u2014 no live feed for this run._'
    );
  }

  const updated = istHhMm(data.lastUpdatedAt);
  const hints = [
    updated ? `updated ${updated} IST` : undefined,
    `full schedule: !train ${data.trainNumber}`,
  ].filter((hint): hint is string => hint !== undefined);

  lines.push('');
  lines.push(footer(hints));

  return lines.join('\n');
}
