import { CACHE_TTL } from './cache.js';
import { railRadarGetCached } from './client.js';
import { sanitizeInline } from './text.js';
import type { TrainSearchResult } from './types.js';
import { isTrainNumber, normalizeStationCode } from './validate.js';

/**
 * Resolution layer: turns what a user typed into a validated identifier.
 *
 * Trains accept a number or a name, resolved through the lookup search API.
 *
 * Stations are **codes only** for now.
 *
 * TODO(station-names): accept station names in `!between` once RailRadar's new
 * search engine ships. The current v1 station search is not accurate enough to
 * guess on the user's behalf:
 *   - searching "mumbai" ranks LTT above MMCT;
 *   - MMCT, BCL and BCT are all named "Mumbai Central", and only MMCT carries
 *     traffic, so picking the wrong one silently returns zero trains.
 * When the v2 search API is available, replace `validateStationCode` with a
 * resolver that returns a ranked match plus alternatives, and drop the
 * city-wide fallback in commands/between.ts.
 */

export type Resolution<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

export type ResolvedTrain = { number: string; name: string | undefined };
export type ResolvedStation = { code: string };

/**
 * Validate a station code. Pure and synchronous: no API call is made, so an
 * unknown code is reported by the upstream lookup rather than by a search guess.
 */
export function validateStationCode(
  input: string
): Resolution<ResolvedStation> {
  const code = normalizeStationCode(input);

  if (!code) {
    return {
      ok: false,
      message: `"${sanitizeInline(input, 40)}" is not a station code. I need codes for now, like \`!between NDLS MMCT\`. Station name search is coming soon.`,
    };
  }

  return { ok: true, value: { code } };
}

/** Choose the best train from search results, preferring an exact number match. */
export function pickTrain(
  results: readonly TrainSearchResult[],
  query: string
): TrainSearchResult | undefined {
  if (results.length === 0) return undefined;

  const wanted = query.trim();
  const exact = results.find((item) => item.number === wanted);

  return exact ?? results[0];
}

function searchTrains(query: string): Promise<TrainSearchResult[]> {
  return railRadarGetCached<TrainSearchResult[]>(
    ['search', 'train', query.toLowerCase()],
    CACHE_TTL.lookup,
    '/v1/lookup/search/trains',
    { q: query, limit: 5 }
  );
}

/** Resolve user text to a 5-digit train number. */
export async function resolveTrain(
  query: string
): Promise<Resolution<ResolvedTrain>> {
  const trimmed = query.trim();

  if (!trimmed) {
    return { ok: false, message: 'Tell me which train you mean.' };
  }

  // A bare 5-digit number needs no lookup.
  if (isTrainNumber(trimmed)) {
    return { ok: true, value: { number: trimmed, name: undefined } };
  }

  const results = await searchTrains(trimmed);
  const match = pickTrain(results, trimmed);

  if (!match) {
    return {
      ok: false,
      message: `I could not find a train matching "${sanitizeInline(trimmed, 40)}". Try the 5-digit train number.`,
    };
  }

  // Never trust an upstream value in a URL path without revalidating it.
  if (!isTrainNumber(match.number)) {
    return {
      ok: false,
      message: `I could not read a valid train number for "${sanitizeInline(trimmed, 40)}".`,
    };
  }

  return { ok: true, value: { number: match.number, name: match.name } };
}
