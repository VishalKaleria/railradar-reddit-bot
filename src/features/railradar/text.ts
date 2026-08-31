/**
 * Text helpers for building Reddit markdown safely.
 *
 * User-supplied text (and to a lesser extent upstream API text) is echoed back
 * in bot replies. Stripping markdown control characters stops someone crafting
 * a comment that makes the bot post links, headings or broken formatting.
 */

/** Characters that carry meaning in Reddit markdown. */
const MARKDOWN_CONTROL = /[`*_~[\]()>#|\\^]/g;

/**
 * Flatten a value to a single safe inline string.
 * Removes newlines and markdown control characters, then truncates.
 */
export function sanitizeInline(value: string, maxLength = 60): string {
  const cleaned = value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(MARKDOWN_CONTROL, '')
    // Collapse runs of whitespace produced by the removals above.
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(1, maxLength - 1)).trimEnd()}\u2026`;
}

/** Title-case a lowercase API token such as a train type or run day. */
export function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const first = word.charAt(0).toUpperCase();
      return `${first}${word.slice(1).toLowerCase()}`;
    })
    .join(' ');
}

/**
 * Mask a PNR so the bot never republishes a full booking reference.
 * `1234567890` becomes `1234****90`.
 */
export function maskPnr(pnr: string): string {
  const digits = pnr.replace(/\D/g, '');
  if (digits.length !== 10) return '**********';
  return `${digits.slice(0, 4)}****${digits.slice(8)}`;
}
