import { CACHE_TTL } from '../cache.js';
import { railRadarGetCached } from '../client.js';
import { renderTrain } from '../render/train.js';
import { resolveTrain } from '../resolve.js';
import type { TrainDetails } from '../types.js';

/** Handle `!train <train>`. */
export async function handleTrain(train: string): Promise<string> {
  const resolved = await resolveTrain(train);
  if (!resolved.ok) return resolved.message;

  const number = resolved.value.number;

  const data = await railRadarGetCached<TrainDetails>(
    ['schedule', number],
    CACHE_TTL.schedule,
    `/v1/trains/${number}`,
    { haltsOnly: true }
  );

  return renderTrain(data);
}
