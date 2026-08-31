import { cached, cacheKey } from './cache.js';
import { mapApiError, RailRadarError } from './errors.js';
import { getRailRadarApiKey } from './settings.js';
import type { Envelope } from './types.js';

/**
 * RailRadar API host. This exact hostname must be listed in
 * devvit.json -> permissions.http.domains and approved by Reddit.
 */
export const RAILRADAR_HOST = 'api.railradar.in';
const BASE_URL = `https://${RAILRADAR_HOST}`;

/**
 * Client-side timeout. Kept well under Devvit's 30s fetch ceiling so the
 * trigger handler always has time to post a friendly failure reply.
 */
const TIMEOUT_MS = 12_000;

export type QueryParams = Record<string, string | number | boolean | undefined>;

/**
 * Build a request URL.
 *
 * Exported for unit testing: `new URL(path, base)` silently discards the base
 * when `path` is absolute, so this is worth pinning down with tests.
 * Absent query params are skipped rather than sent as the string "undefined".
 */
export function buildUrl(path: string, query?: QueryParams): string {
  const url = new URL(path, BASE_URL);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

/**
 * Interpret a parsed API response, returning the payload or throwing a
 * RailRadarError carrying a user-safe message.
 *
 * Pure, so every upstream failure shape can be unit tested without network.
 */
export function unwrapEnvelope<T>(
  status: number,
  body: Envelope<T> | undefined,
  path: string
): T {
  if (!isOkStatus(status) || !body?.success || body.data === undefined) {
    const apiCode = body?.error?.code;

    throw new RailRadarError(
      apiCode ?? `HTTP_${status}`,
      mapApiError({
        httpStatus: status,
        code: apiCode,
        message: body?.error?.message,
        retryAfter: body?.error?.details?.retryAfter,
      }),
      `RailRadar ${path} failed: status=${status} code=${apiCode ?? 'none'} message=${body?.error?.message ?? 'none'}`
    );
  }

  return body.data;
}

function isOkStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * Perform an authenticated GET against the RailRadar API and unwrap the
 * standard `{success, data, error}` envelope.
 *
 * Always throws RailRadarError on failure so callers have a user-safe message.
 */
export async function railRadarGet<T>(
  path: string,
  query?: QueryParams
): Promise<T> {
  const apiKey = await getRailRadarApiKey();
  const url = buildUrl(path, query);

  // AbortController gives a deterministic timeout instead of hanging until the
  // platform kills the request.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    const code = aborted ? 'TIMEOUT' : 'NETWORK';
    throw new RailRadarError(
      code,
      mapApiError({ code }),
      `fetch failed for ${path}: ${String(error)}`
    );
  } finally {
    clearTimeout(timeout);
  }

  // Parse defensively: an error page or proxy response may not be JSON.
  let body: Envelope<T> | undefined;
  try {
    body = (await response.json()) as Envelope<T>;
  } catch {
    // Leave body undefined and fall through to status-based handling.
  }

  return unwrapEnvelope<T>(response.status, body, path);
}

/**
 * Cached authenticated GET.
 *
 * Every caller needs the same read-through-cache wrapper around `railRadarGet`,
 * so it lives here once instead of being rebuilt in each command module.
 */
export async function railRadarGetCached<T>(
  cacheParts: readonly (string | number)[],
  ttlSeconds: number,
  path: string,
  query?: QueryParams
): Promise<T> {
  return cached<T>(cacheKey(...cacheParts), ttlSeconds, () =>
    railRadarGet<T>(path, query)
  );
}
