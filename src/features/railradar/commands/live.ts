import { CACHE_TTL } from '../cache.js';
import { railRadarGetCached } from '../client.js';
import { renderLive } from '../render/live.js';
import { resolveTrain } from '../resolve.js';
import type { LiveTrain } from '../types.js';

/** Handle `!live <train> [date]`. */
export async function handleLive(
  train: string,
  date: string | undefined
): Promise<string> {
  const resolved = await resolveTrain(train);
  if (!resolved.ok) return resolved.message;

  const number = resolved.value.number;

  const data = await railRadarGetCached<LiveTrain>(
    ['live', number, date ?? 'auto'],
    CACHE_TTL.live,
    `/v1/trains/${number}/live`,
    {
      date,
      // Halts only: pass-through stations add payload without adding value to a
      // text reply.
      haltsOnly: true,
    }
  );

  return renderLive(data);
}
