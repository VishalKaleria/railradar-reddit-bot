// Type definitions for the subset of the RailRadar API that this bot consumes.
// Source of truth: https://api.railradar.in/openapi.json (OpenAPI 3.1).
// Optional fields are declared with explicit `| undefined` because the project
// enables `exactOptionalPropertyTypes`.

/** Standard response envelope wrapping every RailRadar API response. */
export type Envelope<T> = {
  success: boolean;
  data?: T | undefined;
  error?:
    | {
        code: string;
        message: string;
        details?: { retryAfter?: string | undefined } | undefined;
      }
    | undefined;
  meta?:
    | {
        timestamp?: string | undefined;
        traceId?: string | undefined;
        source?: string | undefined;
        executionTime?: number | undefined;
      }
    | undefined;
};

export type StationRef = {
  code: string;
  name: string;
  lat?: number | null | undefined;
  lng?: number | null | undefined;
};

export type TrainInfo = {
  number: string;
  name: string;
  type?: string | null | undefined;
  category?: string | null | undefined;
  source: StationRef;
  destination: StationRef;
  runDays: string[];
  distance?: number | null | undefined;
  duration?: number | null | undefined;
  avgSpeed?: number | null | undefined;
  maxSpeed?: number | null | undefined;
  totalHalts?: number | null | undefined;
};

export type StaticRouteStop = {
  sequence: number;
  station: StationRef;
  arrival?: string | null | undefined;
  departure?: string | null | undefined;
  arrivalDay?: number | null | undefined;
  departureDay?: number | null | undefined;
  distance?: number | null | undefined;
  isHalt: boolean;
  platform?: string | null | undefined;
};

/** Response of GET /v1/trains/{number} */
export type TrainDetails = {
  train: TrainInfo;
  route: StaticRouteStop[];
};

export type HaltContext = {
  stationCode: string;
  stationName: string;
  sequence: number;
  distance?: number | null | undefined;
};

export type CurrentLocation = {
  stationCode: string;
  status: 'at-station' | 'departed';
  isHalt: boolean;
  sequence?: number | null | undefined;
  distanceFromOriginKm?: number | null | undefined;
  segmentProgress?: number | null | undefined;
  speedKmh?: number | null | undefined;
};

export type TrainException = {
  type:
    | 'CANCELLED'
    | 'PARTIALLY_CANCELLED'
    | 'DIVERTED'
    | 'RESCHEDULED'
    | 'UNKNOWN';
  message: string;
};

export type LiveRouteStop = {
  sequence: number;
  stationCode: string;
  stationName: string;
  isHalt: boolean;
  scheduledArrival?: string | null | undefined;
  scheduledDeparture?: string | null | undefined;
  actualArrival?: string | null | undefined;
  actualDeparture?: string | null | undefined;
  delayArrival?: number | null | undefined;
  delayDeparture?: number | null | undefined;
  status: 'departed' | 'at-station' | 'upcoming' | 'diverted' | 'cancelled';
  platform?: string | null | undefined;
  distance?: number | null | undefined;
};

/** Response of GET /v1/trains/{number}/live */
export type LiveTrain = {
  trainNumber: string;
  trainName: string;
  startDate: string;
  lastUpdatedAt?: string | null | undefined;
  status: 'running' | 'not-started' | 'completed' | 'cancelled';
  delayMinutes?: number | null | undefined;
  train: TrainInfo;
  currentLocation?: CurrentLocation | null | undefined;
  previousHalt?: HaltContext | null | undefined;
  nextHalt?: HaltContext | null | undefined;
  exceptions?: TrainException[] | null | undefined;
  route: LiveRouteStop[];
  isLive: boolean;
  trackingMode: 'real-time' | 'simulated' | 'none';
};

export type TrainBetweenStations = {
  train: {
    number: string;
    name: string;
    type?: string | null | undefined;
    category?: string | null | undefined;
    runDays: string[];
  };
  // The live API includes the actual boarding/alighting station on each entry.
  // These matter when `byCity=true` expands the search across a metro area,
  // because the train may not call at the station the user named.
  from: {
    code?: string | undefined;
    name?: string | undefined;
    city?: string | undefined;
    departure?: string | null | undefined;
    day: number;
    sequence: number;
  };
  to: {
    code?: string | undefined;
    name?: string | undefined;
    city?: string | undefined;
    arrival?: string | null | undefined;
    day: number;
    sequence: number;
  };
  distance?: number | null | undefined;
  duration?: number | null | undefined;
  totalHaltsBetween: number;
  live?:
    | {
        type: 'at-station' | 'upcoming' | 'departed' | 'not-running';
        delayMinutes?: number | undefined;
      }
    | null
    | undefined;
};

/** Response of GET /v1/trains/between/{from}/{to} */
export type TrainsBetween = {
  from: StationRef;
  to: StationRef;
  count: number;
  trains: TrainBetweenStations[];
};

/**
 * Per-passenger booking or current status.
 *
 * PRIVACY: upstream also returns `berthNo` and a `formatted` string that can
 * embed the coach/berth allocation. Neither is modelled here **on purpose**, so
 * there is no field for a renderer to read even by accident.
 */
export type PnrPassengerStatus = {
  status: string;
  quota?: string | undefined;
};

export type Passenger = {
  serialNumber: number;
  booking: PnrPassengerStatus;
  current: PnrPassengerStatus;
  isConfirmed: boolean;
  isRAC: boolean;
  isWaitlisted: boolean;
  isCancelled: boolean;
};

/**
 * Response of GET /v1/pnr/{pnr}.
 *
 * Verified against production: journey details live on `train`
 * (`journeyDate`, `journeyClass`) rather than in a separate `journey` object,
 * and quota is per passenger.
 */
export type PnrStatus = {
  pnrNumber: string;
  train: {
    number: string;
    name: string;
    journeyDate: string;
    source: StationRef;
    destination: StationRef;
    boardingPoint?: StationRef | undefined;
    reservationUpto?: StationRef | undefined;
    journeyClass?: string | undefined;
    bookingFare?: number | undefined;
  };
  charting: {
    isPrepared: boolean;
    status: string;
  };
  isWaitlisted?: boolean | undefined;
  passengers: Passenger[];
  generatedAt?: string | undefined;
};

/** Response of GET /v1/pnr/{pnr}/prediction */
export type PnrPrediction = {
  probability: number;
  probabilityPercent?: number | undefined;
  probabilityStatus?: string | undefined;
  header?: string | undefined;
};

/** Item from GET /v1/lookup/search/stations */
export type StationSearchResult = {
  code: string;
  name: string;
  city?: string | undefined;
};

/**
 * Item from GET /v1/lookup/search/trains.
 * The live API returns `dest`/`destName` (verified against production), so the
 * spec's `destination` field is treated as an optional fallback.
 */
export type TrainSearchResult = {
  number: string;
  name: string;
  source?: string | undefined;
  sourceName?: string | undefined;
  dest?: string | undefined;
  destName?: string | undefined;
  destination?: string | undefined;
  type?: string | undefined;
};
