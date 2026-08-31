/**
 * Domain format rules for Indian Railways identifiers.
 *
 * This module deliberately has **no imports**: the command parser is pure and
 * unit tested without loading the Devvit runtime, so the patterns it needs
 * cannot live alongside anything that reaches the network.
 *
 * These predicates are also the security boundary. Only values that satisfy
 * them are ever interpolated into an API URL path.
 */

/** Indian Railways train numbers are exactly five digits. */
export const TRAIN_NUMBER_PATTERN = /^\d{5}$/;

/** Station codes are 1-10 uppercase alphanumerics, e.g. NDLS, MMCT, S1. */
export const STATION_CODE_PATTERN = /^[A-Z0-9]{1,10}$/;

/** A PNR is exactly ten digits. */
export const PNR_PATTERN = /^\d{10}$/;

export function isTrainNumber(value: string): boolean {
  return TRAIN_NUMBER_PATTERN.test(value.trim());
}

export function isPnrNumber(value: string): boolean {
  return PNR_PATTERN.test(value.trim());
}

/**
 * Uppercase a station code, or return undefined when it cannot be one.
 * This is the only station-code check callers need: a defined result is both
 * the validity signal and the canonical value.
 */
export function normalizeStationCode(value: string): string | undefined {
  const upper = value.trim().toUpperCase();
  return STATION_CODE_PATTERN.test(upper) ? upper : undefined;
}

/**
 * Strip the spaces and dashes people use when typing a PNR, returning the bare
 * digits only when the result is a valid PNR.
 */
export function normalizePnr(value: string): string | undefined {
  const digits = value.replace(/[\s-]/g, '');
  return PNR_PATTERN.test(digits) ? digits : undefined;
}
