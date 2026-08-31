import { isIsoDateKey, istDateKey, shiftDateKey } from './time.js';
import { isTrainNumber, normalizePnr } from './validate.js';

/**
 * Comment command parsing. Entirely pure and synchronous so the whole surface
 * can be unit tested with no network or Redis access.
 *
 * Rules, chosen deliberately:
 *  - A command must start a line. This stops "trains here are never !live"
 *    from triggering, and naturally ignores markdown quotes (`> !live 12951`)
 *    which is what a user quoting the bot produces.
 *  - Only the first valid command in a comment is processed, so one comment can
 *    never cost several API calls.
 *  - Verbs are case-insensitive and heavily aliased, because a user who guesses
 *    the wrong synonym should still get an answer.
 */

export type Verb = 'live' | 'train' | 'between' | 'pnr' | 'help';

/** Internal verb meaning "work out the intent from the argument shape". */
type VerbOrAuto = Verb | 'auto';

export type ParsedCommand =
  | { kind: 'live'; train: string; date: string | undefined }
  | { kind: 'train'; train: string }
  | { kind: 'between'; from: string; to: string; date: string | undefined }
  | { kind: 'pnr'; pnr: string }
  | { kind: 'help' }
  | { kind: 'usage'; message: string };

/** Longest argument string accepted, to bound abuse and lookup cost. */
const MAX_ARGS_LENGTH = 120;

const VERB_ALIASES: Record<string, VerbOrAuto> = {
  // Live running status.
  live: 'live',
  status: 'live',
  running: 'live',
  delay: 'live',
  late: 'live',
  where: 'live',
  // Static train profile and timetable.
  train: 'train',
  schedule: 'train',
  sched: 'train',
  timetable: 'train',
  tt: 'train',
  // Station-to-station search.
  between: 'between',
  trains: 'between',
  // PNR enquiry.
  pnr: 'pnr',
  ticket: 'pnr',
  // Help.
  help: 'help',
  commands: 'help',
  railradar: 'help',
  // Catch-all: infer from the arguments.
  rail: 'auto',
  route: 'auto',
};

export function resolveVerb(word: string): VerbOrAuto | undefined {
  return VERB_ALIASES[word.toLowerCase()];
}

/** Human-readable usage text, also used by the !help renderer. */
export const USAGE: Record<Verb, string> = {
  live: '`!live 12951` or `!live 12951 tomorrow`',
  train: '`!train 12951`',
  between: '`!between NDLS MMCT`',
  pnr: '`!pnr 1234567890`',
  help: '`!help`',
};

type RawCommand = { verb: VerbOrAuto; argsText: string };

/**
 * Find the first line that begins with a recognised `!verb`.
 * Returns undefined when the comment contains no command.
 */
function findRawCommand(body: string): RawCommand | undefined {
  // Normalise newlines and strip zero-width characters that break matching.
  const normalized = body
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');

  for (const line of normalized.split('\n')) {
    // Allow leading spaces but nothing else, so quotes and code fences are out.
    const match = /^[ \t]*!([A-Za-z]{2,12})(?:\s+([^\n]*))?$/.exec(line);
    if (!match) continue;

    const verbWord = match[1];
    if (!verbWord) continue;

    const verb = resolveVerb(verbWord);
    if (!verb) continue;

    return {
      verb,
      argsText: (match[2] ?? '').trim().slice(0, MAX_ARGS_LENGTH),
    };
  }

  return undefined;
}

/**
 * Pull a journey date out of the argument text.
 * Supports `today`, `tomorrow`, `yesterday`, `YYYY-MM-DD` and `DD-MM-YYYY`.
 */
export function extractDate(
  argsText: string,
  now: Date = new Date()
): { rest: string; date: string | undefined } {
  const tokens = argsText.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  let date: string | undefined;

  for (const token of tokens) {
    // Only the first date-looking token is consumed.
    if (date === undefined) {
      const resolved = parseDateToken(token, now);
      if (resolved) {
        date = resolved;
        continue;
      }
    }
    kept.push(token);
  }

  return { rest: kept.join(' '), date };
}

function parseDateToken(token: string, now: Date): string | undefined {
  const lower = token.toLowerCase();

  if (lower === 'today') return istDateKey(now);
  if (lower === 'tomorrow') return shiftDateKey(istDateKey(now), 1);
  if (lower === 'yesterday') return shiftDateKey(istDateKey(now), -1);

  // ISO form, e.g. 2026-08-30.
  if (isIsoDateKey(token)) return token;

  // Indian conventional form, e.g. 30-08-2026 or 30/08/2026.
  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(token);
  if (dmy) {
    const day = (dmy[1] ?? '').padStart(2, '0');
    const month = (dmy[2] ?? '').padStart(2, '0');
    const candidate = `${dmy[3]}-${month}-${day}`;
    if (isIsoDateKey(candidate)) return candidate;
  }

  return undefined;
}

/**
 * Split "A to B" station arguments.
 * The explicit `to` separator is what makes multi-word station names possible
 * (`new delhi to mumbai central`); without it we fall back to two tokens.
 */
export function splitStations(
  argsText: string
): { from: string; to: string } | undefined {
  // Match a standalone "to" so "Toronto" or "Tondiarpet" are never split.
  const separator = /\s+to\s+/i.exec(argsText);

  if (separator?.index !== undefined) {
    const from = argsText.slice(0, separator.index).trim();
    const to = argsText.slice(separator.index + separator[0].length).trim();
    if (from && to) return { from, to };
    return undefined;
  }

  const tokens = argsText.split(/\s+/).filter(Boolean);
  if (tokens.length === 2 && tokens[0] && tokens[1]) {
    return { from: tokens[0], to: tokens[1] };
  }

  return undefined;
}

/**
 * If the arguments begin with a bare 5-digit train number, use just that.
 * Lets `!live 12951 please` and `!live 12951 any update?` work instead of
 * sending the whole phrase to the search endpoint.
 */
export function takeTrainQuery(rest: string): string {
  const tokens = rest.split(/\s+/).filter(Boolean);
  const first = tokens[0];
  if (first && isTrainNumber(first)) return first;
  return rest;
}

function buildLive(argsText: string, now: Date): ParsedCommand {
  const { rest, date } = extractDate(argsText, now);
  if (!rest) {
    return {
      kind: 'usage',
      message: `Tell me which train. Try ${USAGE.live}.`,
    };
  }
  return { kind: 'live', train: takeTrainQuery(rest), date };
}

function buildTrain(argsText: string, now: Date): ParsedCommand {
  // Dates are meaningless for a static timetable, but users add them anyway.
  const { rest } = extractDate(argsText, now);
  if (!rest) {
    return {
      kind: 'usage',
      message: `Tell me which train. Try ${USAGE.train}.`,
    };
  }
  return { kind: 'train', train: takeTrainQuery(rest) };
}

function buildBetween(argsText: string, now: Date): ParsedCommand {
  const { rest, date } = extractDate(argsText, now);
  const stations = splitStations(rest);

  if (!stations) {
    return {
      kind: 'usage',
      message: `I need two station codes. Try ${USAGE.between}.`,
    };
  }

  return { kind: 'between', from: stations.from, to: stations.to, date };
}

function buildPnr(argsText: string): ParsedCommand {
  const pnr = normalizePnr(argsText);

  if (!pnr) {
    return {
      kind: 'usage',
      message: `A PNR is exactly 10 digits. Try ${USAGE.pnr}.`,
    };
  }

  return { kind: 'pnr', pnr };
}

/** Infer intent for the catch-all verbs from the shape of the arguments. */
function buildAuto(argsText: string, now: Date): ParsedCommand {
  if (!argsText) return { kind: 'help' };

  const { rest, date } = extractDate(argsText, now);

  // 10 digits can only be a PNR.
  const pnr = normalizePnr(rest);
  if (pnr) {
    return { kind: 'pnr', pnr };
  }

  // Two stations, however written, means a route search.
  const stations = splitStations(rest);
  if (stations) {
    // Reuse the date already extracted above; re-parsing `rest` would lose it.
    return { kind: 'between', from: stations.from, to: stations.to, date };
  }

  // Anything else is treated as a train, defaulting to live status because
  // that is overwhelmingly what people want when they name a train.
  if (!rest) {
    return { kind: 'help' };
  }

  return { kind: 'live', train: takeTrainQuery(rest), date };
}

/**
 * Parse a comment body into a command.
 * Returns undefined when the comment contains no recognised command.
 */
export function parseCommand(
  body: string,
  now: Date = new Date()
): ParsedCommand | undefined {
  const raw = findRawCommand(body);
  if (!raw) return undefined;

  switch (raw.verb) {
    case 'live':
      return buildLive(raw.argsText, now);
    case 'train':
      return buildTrain(raw.argsText, now);
    case 'between':
      return buildBetween(raw.argsText, now);
    case 'pnr':
      return buildPnr(raw.argsText);
    case 'help':
      return { kind: 'help' };
    case 'auto':
      return buildAuto(raw.argsText, now);
    default:
      return undefined;
  }
}
