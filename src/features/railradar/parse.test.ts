import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractDate,
  parseCommand,
  resolveVerb,
  splitStations,
  takeTrainQuery,
} from './parse.js';

// Fixed clock so relative dates are deterministic.
// 2026-08-30T15:00:00Z is 2026-08-30 20:30 IST.
const NOW = new Date('2026-08-30T15:00:00Z');

void test('returns undefined when no command is present', () => {
  assert.equal(
    parseCommand('Just a normal comment about trains.', NOW),
    undefined
  );
  assert.equal(parseCommand('', NOW), undefined);
});

void test('parses a live command', () => {
  assert.deepEqual(parseCommand('!live 12951', NOW), {
    kind: 'live',
    train: '12951',
    date: undefined,
  });
});

void test('verb matching is case-insensitive', () => {
  assert.deepEqual(parseCommand('!LIVE 12951', NOW), {
    kind: 'live',
    train: '12951',
    date: undefined,
  });
});

void test('aliases map to their canonical verb', () => {
  assert.equal(resolveVerb('status'), 'live');
  assert.equal(resolveVerb('delay'), 'live');
  assert.equal(resolveVerb('schedule'), 'train');
  assert.equal(resolveVerb('tt'), 'train');
  assert.equal(resolveVerb('trains'), 'between');
  assert.equal(resolveVerb('ticket'), 'pnr');
  assert.equal(resolveVerb('rail'), 'auto');
  assert.equal(resolveVerb('nonsense'), undefined);

  assert.deepEqual(parseCommand('!status 12951', NOW), {
    kind: 'live',
    train: '12951',
    date: undefined,
  });
});

void test('a command must start its line', () => {
  // This is the main defence against false positives in normal prose.
  assert.equal(
    parseCommand('trains here are never !live 12951', NOW),
    undefined
  );
});

void test('ignores commands inside markdown quotes', () => {
  // A user quoting a bot reply must not re-trigger the bot.
  assert.equal(parseCommand('> !live 12951', NOW), undefined);
  assert.equal(
    parseCommand('Some reply\n\n> ^(full schedule: !train 12951)', NOW),
    undefined
  );
});

void test('finds a command on a later line', () => {
  assert.deepEqual(parseCommand('Any updates?\n\n!live 12951', NOW), {
    kind: 'live',
    train: '12951',
    date: undefined,
  });
});

void test('only the first command in a comment is used', () => {
  assert.deepEqual(parseCommand('!train 12951\n!live 12002', NOW), {
    kind: 'train',
    train: '12951',
  });
});

void test('resolves relative dates against the injected clock', () => {
  assert.deepEqual(parseCommand('!live 12951 today', NOW), {
    kind: 'live',
    train: '12951',
    date: '2026-08-30',
  });
  assert.deepEqual(parseCommand('!live 12951 tomorrow', NOW), {
    kind: 'live',
    train: '12951',
    date: '2026-08-31',
  });
  assert.deepEqual(parseCommand('!live 12951 yesterday', NOW), {
    kind: 'live',
    train: '12951',
    date: '2026-08-29',
  });
});

void test('accepts ISO and Indian date formats', () => {
  assert.deepEqual(extractDate('12951 2026-09-01', NOW), {
    rest: '12951',
    date: '2026-09-01',
  });
  assert.deepEqual(extractDate('12951 01-09-2026', NOW), {
    rest: '12951',
    date: '2026-09-01',
  });
  assert.deepEqual(extractDate('12951 01/09/2026', NOW), {
    rest: '12951',
    date: '2026-09-01',
  });
});

void test('rejects impossible calendar dates', () => {
  // 31 February must not silently roll into March.
  assert.deepEqual(extractDate('12951 2026-02-31', NOW), {
    rest: '12951 2026-02-31',
    date: undefined,
  });
});

void test('tolerates trailing words after a train number', () => {
  assert.equal(takeTrainQuery('12951 any update?'), '12951');
  assert.equal(takeTrainQuery('mumbai rajdhani'), 'mumbai rajdhani');

  assert.deepEqual(parseCommand('!live 12951 any update?', NOW), {
    kind: 'live',
    train: '12951',
    date: undefined,
  });
});

void test('splits stations on the "to" separator', () => {
  assert.deepEqual(splitStations('new delhi to mumbai central'), {
    from: 'new delhi',
    to: 'mumbai central',
  });
});

void test('splits two bare station tokens', () => {
  assert.deepEqual(splitStations('NDLS BCT'), { from: 'NDLS', to: 'BCT' });
});

void test('does not split station names that merely contain "to"', () => {
  // "Tondiarpet" and similar must survive; only a standalone "to" separates.
  assert.equal(splitStations('tondiarpet'), undefined);
  assert.deepEqual(splitStations('tondiarpet to chennai'), {
    from: 'tondiarpet',
    to: 'chennai',
  });
});

void test('parses between with a date', () => {
  assert.deepEqual(parseCommand('!between new delhi to mumbai tomorrow', NOW), {
    kind: 'between',
    from: 'new delhi',
    to: 'mumbai',
    date: '2026-08-31',
  });
});

void test('between without two stations returns usage help', () => {
  const result = parseCommand('!between delhi', NOW);
  assert.equal(result?.kind, 'usage');
  if (result?.kind === 'usage') {
    assert.match(result.message, /station code/i);
  }
});

void test('between still accepts the "to" separator with codes', () => {
  assert.deepEqual(parseCommand('!between NDLS to MMCT', NOW), {
    kind: 'between',
    from: 'NDLS',
    to: 'MMCT',
    date: undefined,
  });
});

void test('parses a 10-digit PNR and strips separators', () => {
  assert.deepEqual(parseCommand('!pnr 1234567890', NOW), {
    kind: 'pnr',
    pnr: '1234567890',
  });
  assert.deepEqual(parseCommand('!pnr 1234-5678-90', NOW), {
    kind: 'pnr',
    pnr: '1234567890',
  });
});

void test('rejects a malformed PNR with usage help', () => {
  const result = parseCommand('!pnr 123', NOW);
  assert.equal(result?.kind, 'usage');
});

void test('parses help', () => {
  assert.deepEqual(parseCommand('!help', NOW), { kind: 'help' });
  assert.deepEqual(parseCommand('!commands', NOW), { kind: 'help' });
});

void test('auto verb infers intent from argument shape', () => {
  assert.deepEqual(parseCommand('!rail 1234567890', NOW), {
    kind: 'pnr',
    pnr: '1234567890',
  });
  assert.deepEqual(parseCommand('!rail 12951', NOW), {
    kind: 'live',
    train: '12951',
    date: undefined,
  });
  assert.deepEqual(parseCommand('!rail', NOW), { kind: 'help' });
});

void test('auto verb keeps the date when inferring a route search', () => {
  // Regression: the date was previously dropped on this path.
  assert.deepEqual(parseCommand('!rail delhi to mumbai tomorrow', NOW), {
    kind: 'between',
    from: 'delhi',
    to: 'mumbai',
    date: '2026-08-31',
  });
});

void test('unknown verbs are ignored', () => {
  assert.equal(parseCommand('!banana 12951', NOW), undefined);
});

void test('argument length is bounded', () => {
  const result = parseCommand(`!live ${'9'.repeat(500)}`, NOW);
  assert.equal(result?.kind, 'live');
  if (result?.kind === 'live') {
    assert.ok(result.train.length <= 120);
  }
});
