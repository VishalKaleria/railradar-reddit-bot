import assert from 'node:assert/strict';
import { test } from 'node:test';
import { maskPnr, sanitizeInline, titleCase } from './text.js';
import {
  formatDuration,
  isIsoDateKey,
  istDateKey,
  istHhMm,
  istHhMmShifted,
  shiftDateKey,
} from './time.js';

void test('sanitizeInline strips markdown control characters', () => {
  assert.equal(
    sanitizeInline('[click](http://evil.test)'),
    'clickhttp://evil.test'
  );
  assert.equal(sanitizeInline('**bold**'), 'bold');
  assert.equal(sanitizeInline('back`tick`'), 'backtick');
  assert.equal(sanitizeInline('a > b | c'), 'a b c');
});

void test('sanitizeInline flattens newlines', () => {
  assert.equal(sanitizeInline('line one\nline two'), 'line one line two');
});

void test('sanitizeInline truncates long values', () => {
  const result = sanitizeInline('x'.repeat(100), 10);
  assert.equal(result.length, 10);
  assert.ok(result.endsWith('\u2026'));
});

void test('titleCase normalises API tokens', () => {
  assert.equal(titleCase('mon'), 'Mon');
  assert.equal(titleCase('SHATABDI express'), 'Shatabdi Express');
});

void test('maskPnr hides the middle of the booking reference', () => {
  assert.equal(maskPnr('1234567890'), '1234****90');
});

void test('maskPnr fully masks malformed input', () => {
  assert.equal(maskPnr('123'), '**********');
  assert.equal(maskPnr(''), '**********');
});

void test('istDateKey returns the IST calendar date', () => {
  // 18:45 UTC is already past midnight IST the next day.
  assert.equal(istDateKey(new Date('2026-08-30T18:45:00Z')), '2026-08-31');
  // 05:00 UTC is the same IST day.
  assert.equal(istDateKey(new Date('2026-08-30T05:00:00Z')), '2026-08-30');
});

void test('shiftDateKey moves whole days', () => {
  assert.equal(shiftDateKey('2026-08-31', 1), '2026-09-01');
  assert.equal(shiftDateKey('2026-09-01', -1), '2026-08-31');
  assert.equal(shiftDateKey('2026-03-01', -1), '2026-02-28');
});

void test('istHhMm extracts the clock from an IST timestamp', () => {
  assert.equal(istHhMm('2026-08-30T07:52:00+05:30'), '07:52');
  assert.equal(istHhMm(null), undefined);
  assert.equal(istHhMm(undefined), undefined);
  assert.equal(istHhMm('garbage'), undefined);
});

void test('istHhMmShifted adds delay minutes in IST', () => {
  // Mirrors production: 11272 was 106 minutes late into Bina Jn (sched 20:40).
  assert.equal(istHhMmShifted('2026-08-30T20:40:00+05:30', 106), '22:26');
  assert.equal(istHhMmShifted('2026-08-30T21:52:00+05:30', 12), '22:04');
  assert.equal(istHhMmShifted('2026-08-30T21:52:00+05:30', 0), '21:52');
});

void test('istHhMmShifted rolls past midnight correctly', () => {
  assert.equal(istHhMmShifted('2026-08-30T23:30:00+05:30', 90), '01:00');
});

void test('istHhMmShifted handles unusable input', () => {
  assert.equal(istHhMmShifted(null, 10), undefined);
  assert.equal(istHhMmShifted(undefined, 10), undefined);
  assert.equal(istHhMmShifted('garbage', 10), undefined);
});

void test('isIsoDateKey validates real calendar dates', () => {
  assert.equal(isIsoDateKey('2026-08-30'), true);
  assert.equal(isIsoDateKey('2026-02-31'), false);
  assert.equal(isIsoDateKey('30-08-2026'), false);
  assert.equal(isIsoDateKey('2026-8-3'), false);
});

void test('formatDuration renders compact durations', () => {
  assert.equal(formatDuration(45), '45m');
  assert.equal(formatDuration(120), '2h');
  assert.equal(formatDuration(935), '15h 35m');
  assert.equal(formatDuration(null), undefined);
  assert.equal(formatDuration(undefined), undefined);
});
