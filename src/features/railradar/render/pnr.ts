import { maskPnr, sanitizeInline, titleCase } from '../text.js';
import type { Passenger, PnrPrediction, PnrStatus } from '../types.js';
import { footer, formatStation } from './shared.js';

/**
 * Render a PNR enquiry.
 *
 * PRIVACY: this renderer outputs only aggregate booking status.
 *
 * The upstream payload DOES contain `passengers[].booking.berthNo`,
 * `passengers[].current.berthNo` and a `formatted` string that can embed the
 * coach/berth allocation. None of those are modelled in `types.ts`, and nothing
 * here reads them. Only `status` and the boolean flags are used.
 *
 * Rationale: anyone can pass any 10-digit number to this command, so printing
 * coach and berth would turn the bot into a tool for locating a specific
 * stranger on a specific train. The aggregate view still answers the question
 * people actually ask, which is "will my ticket confirm?".
 */

/** Summarise passengers as counts only, never individually identifiable. */
export function summarizePassengers(passengers: readonly Passenger[]): string {
  if (passengers.length === 0) return 'Passenger status unavailable';

  let confirmed = 0;
  let rac = 0;
  let waitlisted = 0;
  let cancelled = 0;
  let other = 0;

  for (const passenger of passengers) {
    if (passenger.isCancelled) cancelled += 1;
    else if (passenger.isConfirmed) confirmed += 1;
    else if (passenger.isRAC) rac += 1;
    else if (passenger.isWaitlisted) waitlisted += 1;
    // Anything the flags do not classify still has to be accounted for, or the
    // parts would not sum to the stated passenger count.
    else other += 1;
  }

  const parts: string[] = [];
  if (confirmed > 0) parts.push(`${confirmed} CNF`);
  if (rac > 0) parts.push(`${rac} RAC`);
  if (waitlisted > 0) parts.push(`${waitlisted} WL`);
  if (cancelled > 0) parts.push(`${cancelled} cancelled`);
  if (other > 0) parts.push(`${other} other`);

  const total = `${passengers.length} passenger${passengers.length === 1 ? '' : 's'}`;
  return parts.length > 0 ? `${total}: ${parts.join(', ')}` : total;
}

/**
 * Resolve a confirmation chance as a whole percentage.
 *
 * `probabilityPercent` is preferred because it is unambiguous; `probability`
 * alone cannot distinguish "0.5 means 50%" from "0.5 means 0.5%".
 */
export function resolveProbabilityPercent(
  prediction: PnrPrediction
): number | undefined {
  const fromPercent = prediction.probabilityPercent;
  if (typeof fromPercent === 'number' && Number.isFinite(fromPercent)) {
    return clampPercent(fromPercent);
  }

  const raw = prediction.probability;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // A 0..1 ratio scales up; anything above 1 is already a percentage.
    return clampPercent(raw <= 1 ? raw * 100 : raw);
  }

  return undefined;
}

function clampPercent(value: number): number | undefined {
  if (value < 0 || value > 100) return undefined;
  return Math.round(value);
}

/** The quota is per passenger upstream, so read it from the first one. */
function journeyQuota(passengers: readonly Passenger[]): string | undefined {
  const first = passengers[0];
  return first?.current.quota ?? first?.booking.quota;
}

export function renderPnr(
  status: PnrStatus,
  prediction: PnrPrediction | undefined
): string {
  const trainLabel = `${sanitizeInline(status.train.number, 8)} ${sanitizeInline(status.train.name, 40)}`;
  const lines: string[] = [
    `**PNR ${maskPnr(status.pnrNumber)}** \u2014 ${trainLabel}`,
    '',
  ];

  // Journey details live on `train` in the real payload, not a `journey` object.
  const quota = journeyQuota(status.passengers);
  const journeyParts = [
    status.train.journeyDate
      ? sanitizeInline(status.train.journeyDate, 12)
      : undefined,
    status.train.journeyClass
      ? sanitizeInline(status.train.journeyClass, 6)
      : undefined,
    quota ? `${sanitizeInline(quota, 6)} quota` : undefined,
  ].filter((part): part is string => Boolean(part));

  if (journeyParts.length > 0) {
    lines.push(`\u{1f4c5} ${journeyParts.join(' \u00b7 ')}`);
  }

  // Prefer the actual boarding point and reservation limit when present.
  const origin = status.train.boardingPoint ?? status.train.source;
  const destination = status.train.reservationUpto ?? status.train.destination;
  lines.push(
    `\u{1f6a9} ${formatStation(origin)} \u2192 ${formatStation(destination)}`
  );

  lines.push(`\u{1f465} ${summarizePassengers(status.passengers)}`);
  lines.push(`\u{1f4cb} ${sanitizeInline(status.charting.status, 40)}`);

  // Confirmation probability is the single most valuable number for a
  // waitlisted booking, which is the main reason people ask.
  if (prediction) {
    const percent = resolveProbabilityPercent(prediction);
    if (percent !== undefined) {
      // These two fields carry different information, verified against
      // production: `probabilityStatus` grades the chance ("MEDIUM") while
      // `header` reports the waitlist position ("Waiting List #28").
      const grade = prediction.probabilityStatus
        ? ` (${titleCase(sanitizeInline(prediction.probabilityStatus, 20))})`
        : '';
      const position = prediction.header
        ? ` \u00b7 ${sanitizeInline(prediction.header, 30)}`
        : '';

      lines.push(
        `\u{1f4c8} Confirmation chance: ${percent}%${grade}${position}`
      );
    }
  }

  lines.push('');
  lines.push(
    '_Coach and berth details are not shown publicly. Check IRCTC for seat allocation._'
  );

  lines.push('');
  lines.push(footer([]));

  return lines.join('\n');
}
