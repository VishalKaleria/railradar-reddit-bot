import { RailRadarError } from '../errors.js';
import type { ParsedCommand } from '../parse.js';
import { renderHelp } from '../render/help.js';
import { handleBetween } from './between.js';
import { handleLive } from './live.js';
import { handlePnr } from './pnr.js';
import { handleTrain } from './train.js';

/**
 * Command dispatcher.
 *
 * Adding a command means adding one handler module and one case here; nothing
 * else in the feature needs to change.
 */

export type DispatchOptions = {
  /** Moderators can disable PNR lookups without disabling the whole bot. */
  pnrEnabled: boolean;
};

/**
 * Execute a parsed command and return the reply markdown.
 *
 * Expected upstream failures are converted into a user-facing sentence.
 * Unexpected failures are rethrown so the trigger layer can log them and stay
 * silent rather than posting noise.
 */
export async function dispatchCommand(
  command: ParsedCommand,
  options: DispatchOptions
): Promise<string> {
  try {
    switch (command.kind) {
      case 'help':
        return renderHelp({ pnrEnabled: options.pnrEnabled });

      case 'usage':
        return command.message;

      case 'live':
        return await handleLive(command.train, command.date);

      case 'train':
        return await handleTrain(command.train);

      case 'between':
        return await handleBetween(command.from, command.to, command.date);

      case 'pnr':
        if (!options.pnrEnabled) {
          return 'PNR lookups are turned off in this community.';
        }
        return await handlePnr(command.pnr);

      default:
        // Exhaustiveness guard: a new command kind must be handled above.
        return renderHelp({ pnrEnabled: options.pnrEnabled });
    }
  } catch (error) {
    if (error instanceof RailRadarError) {
      // Log the internal detail, show the user the friendly message.
      console.warn(
        `[railradar] command ${command.kind} failed: ${error.code}`,
        error.message
      );
      return error.userMessage;
    }

    throw error;
  }
}
