import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderBetween } from './render/between.js';
import { renderHelp } from './render/help.js';
import { renderLive } from './render/live.js';
import {
  renderPnr,
  resolveProbabilityPercent,
  summarizePassengers,
} from './render/pnr.js';
import {
  delayIndicator,
  formatClock,
  formatDayOffset,
  formatDelay,
  formatRunDays,
  formatStation,
} from './render/shared.js';
import { renderTrain } from './render/train.js';
import type {
  LiveTrain,
  PnrStatus,
  TrainDetails,
  TrainsBetween,
} from './types.js';

const NDLS = { code: 'NDLS', name: 'New Delhi' };
const BCT = { code: 'BCT', name: 'Mumbai Central' };

const TRAIN_INFO = {
  number: '12951',
  name: 'Mumbai Rajdhani',
  type: 'Rajdhani',
  source: NDLS,
  destination: BCT,
  runDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  distance: 1386,
  duration: 935,
  avgSpeed: 89,
  maxSpeed: 130,
};

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

void test('formatDelay describes late, early and on-time', () => {
  assert.equal(formatDelay(0), 'on time');
  assert.equal(formatDelay(12), '12 min late');
  assert.equal(formatDelay(-5), '5 min early');
  assert.equal(formatDelay(75), '1h 15m late');
  assert.equal(formatDelay(120), '2h late');
  assert.equal(formatDelay(null), 'delay unknown');
  assert.equal(formatDelay(undefined), 'delay unknown');
});

void test('delayIndicator escalates with severity', () => {
  assert.notEqual(delayIndicator(0), delayIndicator(30));
  assert.equal(delayIndicator(0), delayIndicator(-10));
});

void test('formatRunDays collapses a full week to Daily', () => {
  assert.equal(
    formatRunDays(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
    'Daily'
  );
  assert.equal(formatRunDays(['mon', 'wed', 'fri']), 'Mon, Wed, Fri');
  // Output must follow week order, not input order.
  assert.equal(formatRunDays(['fri', 'mon']), 'Mon, Fri');
  assert.equal(formatRunDays([]), 'run days unknown');
});

void test('formatStation renders name and code', () => {
  assert.equal(formatStation(NDLS), 'New Delhi (NDLS)');
  assert.equal(formatStation(undefined), 'unknown');
});

void test('formatDayOffset only shows positive offsets', () => {
  assert.equal(formatDayOffset(1, 1), '');
  assert.equal(formatDayOffset(1, 2), ' (+1)');
  assert.equal(formatDayOffset(2, 1), '');
});

void test('formatClock renders times and marks missing ones', () => {
  assert.equal(formatClock('16:55'), '16:55');
  assert.equal(formatClock(null), '\u2014');
  assert.equal(formatClock(undefined), '\u2014');
  assert.equal(formatClock(''), '\u2014');
});

// ---------------------------------------------------------------------------
// live
// ---------------------------------------------------------------------------

const RUNNING_LIVE: LiveTrain = {
  trainNumber: '12951',
  trainName: 'Mumbai Rajdhani',
  startDate: '2026-08-30',
  lastUpdatedAt: '2026-08-30T20:41:00+05:30',
  status: 'running',
  delayMinutes: 12,
  train: TRAIN_INFO,
  currentLocation: {
    stationCode: 'KOTA',
    status: 'departed',
    isHalt: true,
    speedKmh: 128,
    distanceFromOriginKm: 738,
  },
  previousHalt: { stationCode: 'KOTA', stationName: 'Kota Jn', sequence: 4 },
  nextHalt: { stationCode: 'SWM', stationName: 'Sawai Madhopur', sequence: 5 },
  route: [
    {
      sequence: 5,
      stationCode: 'SWM',
      stationName: 'Sawai Madhopur',
      isHalt: true,
      scheduledArrival: '2026-08-30T21:52:00+05:30',
      delayArrival: 12,
      status: 'upcoming',
      platform: '2',
    },
  ],
  isLive: true,
  trackingMode: 'real-time',
};

void test('renderLive leads with the delay', () => {
  const output = renderLive(RUNNING_LIVE);

  assert.match(output, /12951 Mumbai Rajdhani/);
  assert.match(output, /12 min late/);
  assert.match(output, /Departed Kota Jn/);
  assert.match(output, /128 km\/h/);
  assert.match(output, /Sawai Madhopur/);
  assert.match(output, /PF 2/);
  assert.match(output, /738 of 1386 km/);
  assert.match(output, /updated 20:41 IST/);
});

void test('renderLive shows the expected arrival, not the timetable time', () => {
  // Regression: previously rendered "ETA 21:52 (+12)", which reads as a past
  // time once the delay is large. Scheduled 21:52 + 12 min late = 22:04.
  const output = renderLive(RUNNING_LIVE);

  assert.match(output, /ETA 22:04 \(12 min late\)/);
  assert.doesNotMatch(output, /\(\+12\)/);
});

void test('renderLive shows a large delay as a real clock time', () => {
  // Mirrors production: 11272 was 106 minutes late at Bina Jn.
  const veryLate: LiveTrain = {
    ...RUNNING_LIVE,
    delayMinutes: 106,
    route: [
      {
        sequence: 5,
        stationCode: 'BINA',
        stationName: 'Bina Jn',
        isHalt: true,
        scheduledArrival: '2026-08-30T20:40:00+05:30',
        delayArrival: 106,
        status: 'upcoming',
        platform: '1',
      },
    ],
    nextHalt: { stationCode: 'BINA', stationName: 'Bina Jn', sequence: 5 },
  };

  const output = renderLive(veryLate);

  // 20:40 + 1h 46m = 22:26.
  assert.match(output, /ETA 22:26 \(1h 46m late\)/);
});

void test('renderLive shows a plain time when the train is on time', () => {
  const onTime: LiveTrain = {
    ...RUNNING_LIVE,
    delayMinutes: 0,
    route: [
      {
        sequence: 5,
        stationCode: 'SWM',
        stationName: 'Sawai Madhopur',
        isHalt: true,
        scheduledArrival: '2026-08-30T21:52:00+05:30',
        delayArrival: 0,
        status: 'upcoming',
      },
    ],
  };

  const output = renderLive(onTime);
  assert.match(output, /ETA 21:52/);
  assert.doesNotMatch(output, /late\)/);
});

void test('renderLive labels estimated data honestly', () => {
  const estimated: LiveTrain = {
    ...RUNNING_LIVE,
    isLive: false,
    trackingMode: 'simulated',
  };

  assert.match(renderLive(estimated), /Estimated from the timetable/);
  // The real-time variant must not carry the disclaimer.
  assert.doesNotMatch(renderLive(RUNNING_LIVE), /Estimated from the timetable/);
});

void test('renderLive surfaces cancellations and diversions', () => {
  const diverted: LiveTrain = {
    ...RUNNING_LIVE,
    exceptions: [
      { type: 'DIVERTED', message: 'Train is diverted between NDLS and AGC' },
    ],
  };

  assert.match(renderLive(diverted), /diverted between NDLS and AGC/);
});

void test('renderLive handles a train that has not started', () => {
  const notStarted: LiveTrain = {
    ...RUNNING_LIVE,
    status: 'not-started',
    delayMinutes: null,
    route: [
      {
        sequence: 1,
        stationCode: 'NDLS',
        stationName: 'New Delhi',
        isHalt: true,
        scheduledDeparture: '2026-08-31T16:55:00+05:30',
        status: 'upcoming',
      },
    ],
  };

  const output = renderLive(notStarted);
  assert.match(output, /not started yet/);
  assert.match(output, /16:55/);
});

void test('renderLive names the station the train is standing at', () => {
  // Regression: the current location was previously named from previousHalt,
  // so a train standing at Vadodara rendered "At Kota Jn".
  const atStation: LiveTrain = {
    ...RUNNING_LIVE,
    currentLocation: {
      stationCode: 'SWM',
      status: 'at-station',
      isHalt: true,
      speedKmh: 0,
    },
    previousHalt: { stationCode: 'KOTA', stationName: 'Kota Jn', sequence: 4 },
    nextHalt: {
      stationCode: 'SWM',
      stationName: 'Sawai Madhopur',
      sequence: 5,
    },
  };

  const output = renderLive(atStation);

  assert.match(output, /At Sawai Madhopur/);
  assert.doesNotMatch(output, /At Kota Jn/);
});

void test('renderLive falls back to the station code when no name is known', () => {
  const unknownStation: LiveTrain = {
    ...RUNNING_LIVE,
    currentLocation: {
      stationCode: 'XYZ',
      status: 'departed',
      isHalt: false,
    },
    previousHalt: null,
    nextHalt: null,
    route: [],
  };

  assert.match(renderLive(unknownStation), /Departed XYZ/);
});

void test('renderLive includes a cross-link hint to the schedule', () => {
  // Discovery mechanism; also the reason the self-author guard is required.
  assert.match(renderLive(RUNNING_LIVE), /!train 12951/);
});

// ---------------------------------------------------------------------------
// train
// ---------------------------------------------------------------------------

void test('renderTrain shows profile and halts', () => {
  const details: TrainDetails = {
    train: TRAIN_INFO,
    route: [
      {
        sequence: 1,
        station: NDLS,
        departure: '16:55',
        distance: 0,
        isHalt: true,
      },
      {
        sequence: 2,
        station: { code: 'KOTA', name: 'Kota Jn' },
        arrival: '22:30',
        departure: '22:40',
        distance: 465,
        isHalt: true,
      },
      {
        sequence: 3,
        station: BCT,
        arrival: '08:32',
        distance: 1386,
        isHalt: true,
      },
    ],
  };

  const output = renderTrain(details);
  assert.match(output, /12951 Mumbai Rajdhani/);
  assert.match(output, /New Delhi \(NDLS\)/);
  assert.match(output, /Daily/);
  assert.match(output, /1386 km/);
  assert.match(output, /15h 35m/);
  assert.match(output, /Kota Jn/);
  assert.match(output, /!live 12951/);
});

void test('renderTrain truncates long routes but keeps the destination', () => {
  const manyStops = Array.from({ length: 20 }, (_, index) => ({
    sequence: index + 1,
    station: { code: `S${index}`, name: `Station ${index}` },
    arrival: '10:00',
    departure: '10:05',
    distance: index * 50,
    isHalt: true,
  }));

  const output = renderTrain({ train: TRAIN_INFO, route: manyStops });

  assert.match(output, /20 total/);
  // Final stop must still be present after truncation.
  assert.match(output, /Station 19/);
});

// ---------------------------------------------------------------------------
// between
// ---------------------------------------------------------------------------

void test('renderBetween lists trains with day offsets', () => {
  const data: TrainsBetween = {
    from: NDLS,
    to: BCT,
    count: 2,
    trains: [
      {
        train: {
          number: '12951',
          name: 'Mumbai Rajdhani',
          runDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        },
        from: { departure: '16:55', day: 1, sequence: 1 },
        to: { arrival: '08:32', day: 2, sequence: 9 },
        duration: 937,
        totalHaltsBetween: 4,
      },
      {
        train: { number: '12953', name: 'August Kranti', runDays: ['mon'] },
        from: { departure: '17:15', day: 1, sequence: 1 },
        to: { arrival: '09:45', day: 2, sequence: 11 },
        duration: 990,
        totalHaltsBetween: 6,
      },
    ],
  };

  const output = renderBetween(data, '2026-08-31');
  assert.match(output, /New Delhi \(NDLS\)/);
  assert.match(output, /2 direct train/);
  assert.match(output, /2026-08-31/);
  assert.match(output, /08:32 \(\+1\)/);
  assert.match(output, /15h 37m/);
  assert.match(output, /Mon/);
});

void test('renderBetween handles no results', () => {
  const empty: TrainsBetween = { from: NDLS, to: BCT, count: 0, trains: [] };
  assert.match(renderBetween(empty, '2026-08-31'), /No direct trains/);
});

void test('renderBetween marks stations in the same city that differ', () => {
  // Real behaviour: byCity=true returns trains alighting at KYN/PNVL/BSR rather
  // than the station the user named, so the code must be shown.
  const data: TrainsBetween = {
    from: NDLS,
    to: { code: 'MMCT', name: 'Mumbai Central' },
    count: 1,
    trains: [
      {
        train: { number: '12138', name: 'Punjab Mail', runDays: ['mon'] },
        from: { code: 'NDLS', departure: '05:10', day: 1, sequence: 1 },
        to: { code: 'KYN', arrival: '06:12', day: 2, sequence: 30 },
        duration: 1502,
        totalHaltsBetween: 20,
      },
    ],
  };

  const output = renderBetween(data, undefined, { byCity: true });

  assert.match(output, /city-wide search/);
  // Arrival is at Kalyan, not Mumbai Central; that must be visible.
  assert.match(output, /@KYN/);
  // Departure matches the headline station, so it needs no annotation.
  assert.doesNotMatch(output, /@NDLS/);

  // Without byCity the annotation legend is absent.
  assert.doesNotMatch(
    renderBetween(data, undefined, { byCity: false }),
    /city-wide search/
  );
});

// ---------------------------------------------------------------------------
// pnr
// ---------------------------------------------------------------------------

void test('summarizePassengers reports counts only', () => {
  assert.equal(
    summarizePassengers([
      {
        serialNumber: 1,
        booking: { status: 'CNF', quota: 'GN' },
        current: { status: 'CNF', quota: 'GN' },
        isConfirmed: true,
        isRAC: false,
        isWaitlisted: false,
        isCancelled: false,
      },
      {
        serialNumber: 2,
        booking: { status: 'WL', quota: 'GN' },
        current: { status: 'RAC', quota: 'GN' },
        isConfirmed: false,
        isRAC: true,
        isWaitlisted: false,
        isCancelled: false,
      },
    ]),
    '2 passengers: 1 CNF, 1 RAC'
  );

  assert.equal(summarizePassengers([]), 'Passenger status unavailable');
});

void test('summarizePassengers accounts for unclassified passengers', () => {
  // Parts must always sum to the stated total, even when no flag matches.
  assert.equal(
    summarizePassengers([
      {
        serialNumber: 1,
        booking: { status: '?' },
        current: { status: '?' },
        isConfirmed: false,
        isRAC: false,
        isWaitlisted: false,
        isCancelled: false,
      },
    ]),
    '1 passenger: 1 other'
  );
});

void test('resolveProbabilityPercent prefers the unambiguous percent field', () => {
  // 0.5 as a percent must stay 1%, not be misread as 50%.
  assert.equal(
    resolveProbabilityPercent({ probability: 0.5, probabilityPercent: 0.5 }),
    1
  );
  assert.equal(
    resolveProbabilityPercent({ probability: 0.066, probabilityPercent: 6.6 }),
    7
  );
  // Falls back to the 0..1 ratio when no percent field is supplied.
  assert.equal(resolveProbabilityPercent({ probability: 0.854 }), 85);
  assert.equal(resolveProbabilityPercent({ probability: 85.4 }), 85);
  assert.equal(
    resolveProbabilityPercent({ probability: Number.NaN }),
    undefined
  );
  assert.equal(resolveProbabilityPercent({ probability: 150 }), undefined);
});

const PNR_STATUS: PnrStatus = {
  pnrNumber: '1234567890',
  train: {
    number: '12948',
    name: 'Azimabad SF Express',
    journeyDate: '2026-09-05',
    journeyClass: '3A',
    source: { code: 'ARA', name: 'Ara' },
    destination: { code: 'ADI', name: 'Ahmedabad Jn' },
    boardingPoint: { code: 'ARA', name: 'Ara' },
    reservationUpto: { code: 'ADI', name: 'Ahmedabad Jn' },
    bookingFare: 1930,
  },
  charting: { isPrepared: false, status: 'Chart Not Prepared' },
  isWaitlisted: true,
  passengers: [
    {
      serialNumber: 1,
      booking: { status: 'WL', quota: 'GN' },
      current: { status: 'WL', quota: 'GN' },
      isConfirmed: false,
      isRAC: false,
      isWaitlisted: true,
      isCancelled: false,
    },
  ],
};

void test('renderPnr masks the PNR and never leaks berth details', () => {
  // Values mirror a real production response.
  const output = renderPnr(PNR_STATUS, {
    probability: 0.5,
    probabilityPercent: 50,
    probabilityStatus: 'MEDIUM',
    header: 'Waiting List #28',
  });

  assert.match(output, /1234\*\*\*\*90/);
  // The full PNR must never appear in the reply.
  assert.doesNotMatch(output, /1234567890/);
  assert.match(output, /1 passenger: 1 WL/);
  assert.match(output, /Chart Not Prepared/);
  assert.match(output, /2026-09-05/);
  assert.match(output, /3A/);
  assert.match(output, /GN quota/);
  assert.match(output, /Ara \(ARA\)/);
  // The grade describes the chance; the header reports the waitlist position.
  assert.match(output, /Confirmation chance: 50% \(Medium\)/);
  assert.match(output, /Waiting List 28/);
  assert.match(output, /not shown publicly/i);
  // Upstream carries berthNo inside booking/current; no berth VALUE may surface.
  // (The disclaimer itself contains the word "berth", so match on digits.)
  assert.doesNotMatch(output, /berth\s*(?:no\.?|number|#)?\s*\d/i);
  assert.doesNotMatch(output, /berthNo/);
  assert.doesNotMatch(output, /coach\s*[A-Z]?\d/i);
});

void test('renderPnr works without a prediction', () => {
  const output = renderPnr(PNR_STATUS, undefined);
  assert.match(output, /1234\*\*\*\*90/);
  assert.doesNotMatch(output, /Confirmation chance/);
});

void test('renderPnr tolerates a missing journey class and quota', () => {
  const sparse: PnrStatus = {
    ...PNR_STATUS,
    train: { ...PNR_STATUS.train, journeyClass: undefined },
    passengers: [
      {
        serialNumber: 1,
        booking: { status: 'CNF' },
        current: { status: 'CNF' },
        isConfirmed: true,
        isRAC: false,
        isWaitlisted: false,
        isCancelled: false,
      },
    ],
  };

  const output = renderPnr(sparse, undefined);
  assert.match(output, /2026-09-05/);
  assert.match(output, /1 passenger: 1 CNF/);
  assert.doesNotMatch(output, /quota/);
});

// ---------------------------------------------------------------------------
// help
// ---------------------------------------------------------------------------

void test('renderHelp lists commands and respects the PNR toggle', () => {
  const withPnr = renderHelp({ pnrEnabled: true });
  assert.match(withPnr, /!live 12951/);
  assert.match(withPnr, /!train 12951/);
  assert.match(withPnr, /!between NDLS MMCT/);
  assert.match(withPnr, /!pnr/);
  // Must set the expectation that station names are not supported yet.
  assert.match(withPnr, /codes.*for now/i);

  const withoutPnr = renderHelp({ pnrEnabled: false });
  assert.doesNotMatch(withoutPnr, /!pnr/);
});
