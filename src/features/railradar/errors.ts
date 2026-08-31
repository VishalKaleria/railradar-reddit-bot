// Error handling for RailRadar API calls.
//
// Design goal: every failure the bot can hit must produce a short, honest,
// human-readable sentence. Users see "Indian Railways is under nightly
// maintenance" instead of "503".

/** Error carrying a message that is safe and useful to show to a Reddit user. */
export class RailRadarError extends Error {
  readonly code: string;
  readonly userMessage: string;

  constructor(code: string, userMessage: string, internalMessage?: string) {
    super(internalMessage ?? userMessage);
    this.name = 'RailRadarError';
    this.code = code;
    this.userMessage = userMessage;
  }
}

export type ApiErrorInput = {
  httpStatus?: number | undefined;
  code?: string | undefined;
  message?: string | undefined;
  retryAfter?: string | undefined;
};

/**
 * Extract a displayable IST clock time from an ISO timestamp that already
 * carries the +05:30 offset. Returns undefined when the shape is unexpected,
 * so callers can fall back to a generic sentence.
 */
export function retryAfterClock(
  retryAfter: string | undefined
): string | undefined {
  if (!retryAfter) return undefined;
  const match = /T(\d{2}):(\d{2})/.exec(retryAfter);
  if (!match) return undefined;

  const hours = Number.parseInt(match[1] ?? '', 10);
  const minutes = match[2] ?? '00';
  if (!Number.isFinite(hours)) return undefined;

  // Render as 12-hour IST because that is how Indian Railways publishes the
  // nightly PRS maintenance window.
  const suffix = hours < 12 ? 'AM' : 'PM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${suffix} IST`;
}

/**
 * Whether an upstream error code means "not found".
 *
 * Production returns suffixed variants (`TRAIN_NOT_FOUND`, `STATION_NOT_FOUND`)
 * rather than the bare `NOT_FOUND` in the spec, so callers must not compare
 * against the exact string.
 */
export function isNotFoundCode(code: string | undefined): boolean {
  if (!code) return false;
  return code.toUpperCase().endsWith('NOT_FOUND');
}

/**
 * Map an upstream API failure to a user-facing sentence.
 * Pure function so it can be unit tested without network access.
 */
export function mapApiError(input: ApiErrorInput): string {
  const code = (input.code ?? '').toUpperCase();
  const status = input.httpStatus;

  // Indian Railways takes PRS down nightly (~23:30-00:20 IST). This is the
  // single most common transient failure, so it gets a precise message.
  if (code.startsWith('PRS:MAINTENANCE')) {
    const resumeAt = retryAfterClock(input.retryAfter);
    return resumeAt
      ? `Indian Railways systems are under nightly maintenance. Try again after ${resumeAt}.`
      : 'Indian Railways systems are under nightly maintenance (about 11:45 PM - 12:20 AM IST). Please try again later.';
  }

  if (code === 'TIMEOUT') {
    return 'Indian Railways took too long to respond. Please try again in a minute.';
  }

  if (code === 'CONFIG') {
    return 'This bot is not configured correctly yet. A moderator needs to set the RailRadar API key.';
  }

  // The API returns prefixed variants such as TRAIN_NOT_FOUND and
  // STATION_NOT_FOUND, verified against production, so match on the suffix.
  if (isNotFoundCode(code) || status === 404) {
    return 'I could not find that. Please double-check the number or station code.';
  }

  if (code === 'VALIDATION_ERROR' || status === 400) {
    return 'That request looked invalid. Check the format and try again.';
  }

  // Never surface auth problems as user error; it is an operator problem.
  if (status === 401 || status === 403) {
    return 'This bot could not authenticate with RailRadar. A moderator needs to check the API key.';
  }

  if (status === 429) {
    return 'The bot is being rate limited right now. Please try again in a few minutes.';
  }

  if (
    code === 'DB_CONNECTION_ERROR' ||
    status === 503 ||
    status === 502 ||
    status === 504
  ) {
    return 'Indian Railways data is temporarily unavailable. Please try again shortly.';
  }

  return 'Something went wrong fetching that information. Please try again later.';
}
