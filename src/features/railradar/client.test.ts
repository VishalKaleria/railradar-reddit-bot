import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildUrl, RAILRADAR_HOST, unwrapEnvelope } from './client.js';
import { RailRadarError } from './errors.js';
import { isSelfAuthored } from './triggers.js';
import type { Envelope } from './types.js';

// ---------------------------------------------------------------------------
// buildUrl
// ---------------------------------------------------------------------------

void test('buildUrl targets the allow-listed host over https', () => {
  const url = new URL(buildUrl('/v1/trains/12951/live'));

  assert.equal(url.protocol, 'https:');
  assert.equal(url.host, RAILRADAR_HOST);
  assert.equal(url.pathname, '/v1/trains/12951/live');
});

void test('buildUrl omits undefined query params', () => {
  const url = buildUrl('/v1/trains/12951/live', {
    date: undefined,
    haltsOnly: true,
  });

  // An absent date must not become the literal string "undefined".
  assert.doesNotMatch(url, /date=/);
  assert.match(url, /haltsOnly=true/);
});

void test('buildUrl serialises booleans and numbers', () => {
  const url = buildUrl('/v1/lookup/search/trains', { q: 'raj', limit: 5 });

  assert.match(url, /q=raj/);
  assert.match(url, /limit=5/);
});

void test('buildUrl encodes query values', () => {
  const url = buildUrl('/v1/lookup/search/stations', { q: 'new delhi & co' });

  assert.doesNotMatch(url, / /);
  assert.match(url, /new(\+|%20)delhi/);
});

// ---------------------------------------------------------------------------
// unwrapEnvelope
// ---------------------------------------------------------------------------

void test('unwrapEnvelope returns the payload on success', () => {
  const body: Envelope<{ trainNumber: string }> = {
    success: true,
    data: { trainNumber: '12951' },
  };

  assert.deepEqual(unwrapEnvelope(200, body, '/v1/trains/12951'), {
    trainNumber: '12951',
  });
});

void test('unwrapEnvelope rejects a non-2xx status', () => {
  assert.throws(
    () => unwrapEnvelope(500, undefined, '/v1/trains/12951'),
    (error: unknown) => {
      assert.ok(error instanceof RailRadarError);
      assert.equal(error.code, 'HTTP_500');
      return true;
    }
  );
});

void test('unwrapEnvelope surfaces the upstream error code and message', () => {
  const body: Envelope<never> = {
    success: false,
    error: {
      code: 'PRS:MAINTENANCE',
      message: 'under maintenance',
      details: { retryAfter: '2026-08-31T00:20:00+05:30' },
    },
  };

  assert.throws(
    () => unwrapEnvelope(503, body, '/v1/pnr/1234567890'),
    (error: unknown) => {
      assert.ok(error instanceof RailRadarError);
      assert.equal(error.code, 'PRS:MAINTENANCE');
      assert.match(error.userMessage, /maintenance/i);
      assert.match(error.userMessage, /12:20 AM IST/);
      return true;
    }
  );
});

void test('unwrapEnvelope rejects success:true with no data', () => {
  // A 200 with an empty body must not be treated as a valid payload.
  const body: Envelope<unknown> = { success: true };

  assert.throws(
    () => unwrapEnvelope(200, body, '/v1/trains/12951'),
    (error: unknown) => error instanceof RailRadarError
  );
});

void test('unwrapEnvelope rejects success:false even on a 200', () => {
  const body: Envelope<unknown> = {
    success: false,
    error: { code: 'NOT_FOUND', message: 'no such train' },
  };

  assert.throws(
    () => unwrapEnvelope(200, body, '/v1/trains/99999'),
    (error: unknown) => {
      assert.ok(error instanceof RailRadarError);
      assert.equal(error.code, 'NOT_FOUND');
      return true;
    }
  );
});

void test('unwrapEnvelope never leaks the internal detail to users', () => {
  const body: Envelope<never> = {
    success: false,
    error: { code: 'HTTP_401', message: 'bad token' },
  };

  assert.throws(
    () => unwrapEnvelope(401, body, '/v1/trains/12951'),
    (error: unknown) => {
      assert.ok(error instanceof RailRadarError);
      // The user-facing text must not echo upstream internals.
      assert.doesNotMatch(error.userMessage, /bad token/);
      assert.doesNotMatch(error.userMessage, /401/);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// recursion guard
// ---------------------------------------------------------------------------

void test('isSelfAuthored detects the app account case-insensitively', () => {
  assert.equal(isSelfAuthored('railradarinfo', 'railradarinfo'), true);
  assert.equal(isSelfAuthored('RailRadarInfo', 'railradarinfo'), true);
  assert.equal(isSelfAuthored('someuser', 'railradarinfo'), false);
});

void test('isSelfAuthored fails safe when authorship is unknown', () => {
  // Treated as ours so the bot stays silent instead of risking a reply loop.
  assert.equal(isSelfAuthored(undefined, 'railradarinfo'), true);
  assert.equal(isSelfAuthored('[deleted]', 'railradarinfo'), true);
  assert.equal(isSelfAuthored('someuser', undefined), true);
  assert.equal(isSelfAuthored(undefined, undefined), true);
});
