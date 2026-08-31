// Indian Railways operates entirely on IST, and the RailRadar API returns
// timestamps already carrying the +05:30 offset (see its `toISTISOString`).
//
// A fixed +05:30 offset is exact here: India observes no daylight saving time
// and has used a single IST offset since 1945, so there is no DST edge case to
// handle. This mirrors how the RailRadar API itself derives IST timestamps.
//
// Every function here is pure so it can be unit tested with an injected clock.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Current date in IST as `YYYY-MM-DD`. */
export function istDateKey(now: Date = new Date()): string {
  // Shift the instant by +05:30 then read the UTC calendar date, which yields
  // the IST calendar date.
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Shift a `YYYY-MM-DD` key by whole days, staying in the same calendar space. */
export function shiftDateKey(dateKey: string, days: number): string {
  const parsed = Date.parse(`${dateKey}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return dateKey;
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Pull the clock time out of an ISO timestamp that already carries the IST
 * offset. String extraction is intentional: it avoids re-deriving a timezone
 * and cannot drift if the runtime is not in IST.
 */
export function istHhMm(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const match = /T(\d{2}:\d{2})/.exec(iso);
  return match?.[1];
}

/**
 * Shift an IST timestamp by a number of minutes and return the IST clock time.
 *
 * Used to show a train's *expected* arrival rather than its scheduled arrival:
 * "ETA 20:40 (+106)" makes the reader do the arithmetic, and reads as a time in
 * the past once the delay exceeds the remaining wait.
 */
export function istHhMmShifted(
  iso: string | null | undefined,
  minutes: number
): string | undefined {
  if (!iso) return undefined;

  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return undefined;

  // Shift into IST wall-clock space, then read the UTC fields.
  const shifted = new Date(parsed + minutes * 60_000 + IST_OFFSET_MS);
  return shifted.toISOString().slice(11, 16);
}

/** True when the value is a well-formed `YYYY-MM-DD` calendar date. */
export function isIsoDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return false;

  // Reject values like 2026-02-31 that parse but roll over to another day.
  return new Date(timestamp).toISOString().slice(0, 10) === value;
}

/** Format a minute count as a compact human duration, e.g. `16h 25m`. */
export function formatDuration(
  minutes: number | null | undefined
): string | undefined {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return undefined;
  }

  const total = Math.max(0, Math.trunc(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;

  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
