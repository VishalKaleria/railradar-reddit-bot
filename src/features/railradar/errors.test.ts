import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isNotFoundCode,
  mapApiError,
  RailRadarError,
  retryAfterClock,
} from './errors.js';

void test('PRS maintenance produces a specific, actionable message', () => {
  const message = mapApiError({
    httpStatus: 503,
    code: 'PRS:MAINTENANCE',
    retryAfter: '2026-08-31T00:20:00+05:30',
  });

  assert.match(message, /maintenance/i);
  assert.match(message, /12:20 AM IST/);
});

void test('PRS maintenance without retryAfter still explains the window', () => {
  const message = mapApiError({ httpStatus: 503, code: 'PRS:MAINTENANCE' });
  assert.match(message, /maintenance/i);
});

void test('retryAfterClock converts IST timestamps to 12-hour text', () => {
  assert.equal(retryAfterClock('2026-08-31T00:20:00+05:30'), '12:20 AM IST');
  assert.equal(retryAfterClock('2026-08-31T13:05:00+05:30'), '1:05 PM IST');
  assert.equal(retryAfterClock('2026-08-31T12:00:00+05:30'), '12:00 PM IST');
  assert.equal(retryAfterClock(undefined), undefined);
  assert.equal(retryAfterClock('not-a-date'), undefined);
});

void test('not found is mapped to a check-your-input message', () => {
  assert.match(mapApiError({ httpStatus: 404 }), /could not find/i);
  assert.match(mapApiError({ code: 'NOT_FOUND' }), /could not find/i);
});

void test('suffixed NOT_FOUND codes are recognised', () => {
  // Production returns TRAIN_NOT_FOUND / STATION_NOT_FOUND, not bare NOT_FOUND.
  assert.equal(isNotFoundCode('TRAIN_NOT_FOUND'), true);
  assert.equal(isNotFoundCode('STATION_NOT_FOUND'), true);
  assert.equal(isNotFoundCode('NOT_FOUND'), true);
  assert.equal(isNotFoundCode('train_not_found'), true);
  assert.equal(isNotFoundCode('VALIDATION_ERROR'), false);
  assert.equal(isNotFoundCode(undefined), false);

  // Reachable without relying on the HTTP status alone.
  assert.match(mapApiError({ code: 'TRAIN_NOT_FOUND' }), /could not find/i);
});

void test('auth failures never blame the user', () => {
  const message = mapApiError({ httpStatus: 401 });
  assert.match(message, /API key/i);
  // Must not leak status codes or internals to users.
  assert.doesNotMatch(message, /401/);
});

void test('timeouts are reported as retryable', () => {
  assert.match(mapApiError({ code: 'TIMEOUT' }), /too long/i);
});

void test('rate limiting is explained', () => {
  assert.match(mapApiError({ httpStatus: 429 }), /rate limited/i);
});

void test('upstream outages are reported as temporary', () => {
  assert.match(mapApiError({ httpStatus: 503 }), /temporarily unavailable/i);
  assert.match(
    mapApiError({ code: 'DB_CONNECTION_ERROR' }),
    /temporarily unavailable/i
  );
});

void test('unknown failures fall back to a generic message', () => {
  assert.match(mapApiError({}), /something went wrong/i);
});

void test('RailRadarError separates internal and user messages', () => {
  const error = new RailRadarError(
    'CONFIG',
    'User facing text',
    'internal detail'
  );

  assert.equal(error.code, 'CONFIG');
  assert.equal(error.userMessage, 'User facing text');
  assert.equal(error.message, 'internal detail');
  assert.ok(error instanceof Error);
});
