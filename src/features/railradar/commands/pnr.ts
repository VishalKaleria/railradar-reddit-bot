import { CACHE_TTL } from '../cache.js';
import { railRadarGetCached } from '../client.js';
import { renderPnr } from '../render/pnr.js';
import type { PnrPrediction, PnrStatus } from '../types.js';
import { isPnrNumber } from '../validate.js';

/** Handle `!pnr <10 digits>`. */
export async function handlePnr(pnr: string): Promise<string> {
  // Revalidate before interpolating into a URL path, even though the parser
  // already checked the shape.
  if (!isPnrNumber(pnr)) {
    return 'A PNR is exactly 10 digits.';
  }

  const status = await railRadarGetCached<PnrStatus>(
    ['pnr', pnr],
    CACHE_TTL.pnr,
    `/v1/pnr/${pnr}`
  );

  // Only spend a second API call when a prediction is actually meaningful.
  const needsPrediction = status.passengers.some(
    (passenger) => passenger.isWaitlisted || passenger.isRAC
  );

  let prediction: PnrPrediction | undefined;
  if (needsPrediction) {
    try {
      prediction = await railRadarGetCached<PnrPrediction>(
        ['pnr-prediction', pnr],
        CACHE_TTL.prediction,
        `/v1/pnr/${pnr}/prediction`
      );
    } catch (error) {
      // A missing prediction must not sink the whole reply.
      console.warn('[railradar] PNR prediction unavailable', error);
    }
  }

  return renderPnr(status, prediction);
}
