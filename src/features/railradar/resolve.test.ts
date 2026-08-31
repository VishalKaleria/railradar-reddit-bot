import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isOverLimit } from './ratelimit.js';
import { pickTrain, validateStationCode } from './resolve.js';
import { coerceBoundedInt, SETTINGS_DEFAULTS } from './settings.js';
import {
  isPnrNumber,
  isTrainNumber,
  normalizePnr,
  normalizeStationCode,
} from './validate.js';

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

void test('isPnrNumber accepts exactly ten digits', () => {
  assert.equal(isPnrNumber('1234567890'), true);
  assert.equal(isPnrNumber('123456789'), false);
  assert.equal(isPnrNumber('12345678901'), false);
  assert.equal(isPnrNumber('123456789a'), false);
});

void test('normalizePnr strips the separators people type', () => {
  assert.equal(normalizePnr('1234-5678-90'), '1234567890');
  assert.equal(normalizePnr('1234 5678 90'), '1234567890');
  assert.equal(normalizePnr('123'), undefined);
});

// ---------------------------------------------------------------------------
// resolve
// ---------------------------------------------------------------------------

void test('isTrainNumber accepts exactly five digits', () => {
  assert.equal(isTrainNumber('12951'), true);
  assert.equal(isTrainNumber(' 12951 '), true);
  assert.equal(isTrainNumber('1295'), false);
  assert.equal(isTrainNumber('129510'), false);
  assert.equal(isTrainNumber('1295a'), false);
});

void test('normalizeStationCode uppercases codes and rejects unsafe values', () => {
  assert.equal(normalizeStationCode('ndls'), 'NDLS');
  assert.equal(normalizeStationCode(' mmct '), 'MMCT');
  assert.equal(normalizeStationCode('S1'), 'S1');

  // Anything that could escape the URL path must be rejected.
  assert.equal(normalizeStationCode('new delhi'), undefined);
  assert.equal(normalizeStationCode('../../etc/passwd'), undefined);
  assert.equal(normalizeStationCode('ND LS'), undefined);
  assert.equal(normalizeStationCode('NDLS?x=1'), undefined);
  assert.equal(normalizeStationCode(''), undefined);
});

void test('validateStationCode accepts codes and explains rejections', () => {
  const ok = validateStationCode('mmct');
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.value.code, 'MMCT');

  const bad = validateStationCode('new delhi');
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    // Must tell the user what to do and that names are coming.
    assert.match(bad.message, /station code/i);
    assert.match(bad.message, /NDLS MMCT/);
    assert.match(bad.message, /coming soon/i);
  }
});

void test('validateStationCode never leaks markdown from user input', () => {
  const result = validateStationCode('[click](http://evil.test)');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.doesNotMatch(result.message, /\[click\]/);
    assert.doesNotMatch(result.message, /\(http/);
  }
});

void test('pickTrain prefers an exact number match', () => {
  const results = [
    { number: '12953', name: 'August Kranti' },
    { number: '12951', name: 'Mumbai Rajdhani' },
  ];

  assert.equal(pickTrain(results, '12951')?.number, '12951');
  assert.equal(pickTrain(results, 'rajdhani')?.number, '12953');
  assert.equal(pickTrain([], 'rajdhani'), undefined);
});

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

void test('coerceBoundedInt clamps values into range', () => {
  assert.equal(coerceBoundedInt(45, 30, 0, 3600), 45);
  assert.equal(coerceBoundedInt(-5, 30, 0, 3600), 0);
  assert.equal(coerceBoundedInt(999999, 30, 0, 3600), 3600);
});

void test('coerceBoundedInt parses numeric strings', () => {
  assert.equal(coerceBoundedInt('60', 30, 0, 3600), 60);
  assert.equal(coerceBoundedInt(' 60 ', 30, 0, 3600), 60);
});

void test('coerceBoundedInt falls back on unusable input', () => {
  assert.equal(coerceBoundedInt(undefined, 30, 0, 3600), 30);
  assert.equal(coerceBoundedInt(null, 30, 0, 3600), 30);
  assert.equal(coerceBoundedInt('abc', 30, 0, 3600), 30);
  assert.equal(coerceBoundedInt({}, 30, 0, 3600), 30);
});

void test('coerceBoundedInt truncates fractions before clamping', () => {
  assert.equal(coerceBoundedInt(30.9, 10, 0, 3600), 30);
  assert.equal(coerceBoundedInt(0.5, 10, 1, 3600), 1);
});

void test('defaults ship with the feature disabled', () => {
  // A fresh install must never start replying before a mod opts in.
  assert.equal(SETTINGS_DEFAULTS.enabled, false);
  assert.equal(SETTINGS_DEFAULTS.pnrEnabled, true);
});

// ---------------------------------------------------------------------------
// ratelimit
// ---------------------------------------------------------------------------

void test('isOverLimit blocks at the ceiling, not past it', () => {
  assert.equal(isOverLimit(9, 10), false);
  assert.equal(isOverLimit(10, 10), true);
  assert.equal(isOverLimit(11, 10), true);
});
