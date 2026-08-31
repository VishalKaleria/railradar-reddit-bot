import { CACHE_TTL } from '../cache.js';
import { railRadarGetCached } from '../client.js';
import { isNotFoundCode, RailRadarError } from '../errors.js';
import { renderBetween } from '../render/between.js';
import { validateStationCode } from '../resolve.js';
import type { TrainsBetween } from '../types.js';

/**
 * Handle `!between <FROM> <TO> [date]`.
 *
 * Stations must be codes for now. See resolve.ts for the rationale and the
 * follow-up TODO.
 */

/**
 * Shown when a route search finds nothing.
 *
 * A station NAME can satisfy the code pattern ("INDORE" is six valid
 * characters) and the API answers 200-with-no-trains rather than 404, so an
 * empty result is frequently a name typed where a code belongs.
 */
const NAME_VS_CODE_HINT =
  'If you used station names, try codes instead \u2014 for example `!between UJN INDB` for Ujjain to Indore.';

function fetchBetween(
  fromCode: string,
  toCode: string,
  date: string | undefined,
  byCity: boolean
): Promise<TrainsBetween> {
  return railRadarGetCached<TrainsBetween>(
    ['between', fromCode, toCode, date ?? 'any', byCity ? 'city' : 'exact'],
    CACHE_TTL.between,
    `/v1/trains/between/${fromCode}/${toCode}`,
    { date, byCity }
  );
}

export async function handleBetween(
  from: string,
  to: string,
  date: string | undefined
): Promise<string> {
  const origin = validateStationCode(from);
  if (!origin.ok) return origin.message;

  const destination = validateStationCode(to);
  if (!destination.ok) return destination.message;

  const fromCode = origin.value.code;
  const toCode = destination.value.code;

  if (fromCode === toCode) {
    return 'Those are the same station. Give me two different stations.';
  }

  try {
    // Honour the exact codes the user gave.
    const exact = await fetchBetween(fromCode, toCode, date, false);
    if (exact.trains.length > 0) {
      return renderBetween(exact, date, { byCity: false });
    }

    // Some well-known codes carry no service even though the city plainly does:
    // BCT ("Mumbai Central") returns nothing while MMCT returns trains. Rather
    // than dead-end on "no trains", retry city-wide and label it clearly.
    const cityWide = await fetchBetween(fromCode, toCode, date, true);
    if (cityWide.trains.length > 0) {
      return renderBetween(cityWide, date, { byCity: true });
    }

    return `${renderBetween(exact, date, { byCity: false })}\n\n${NAME_VS_CODE_HINT}`;
  } catch (error) {
    // A bad station code surfaces as a NOT_FOUND variant upstream
    // (STATION_NOT_FOUND), not the bare NOT_FOUND in the spec.
    if (error instanceof RailRadarError && isNotFoundCode(error.code)) {
      return `I could not find one of those stations. ${NAME_VS_CODE_HINT}`;
    }
    throw error;
  }
}
