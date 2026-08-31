import { footer } from './shared.js';

/**
 * Render the command reference.
 *
 * Kept deliberately short: a help reply that scrolls is a help reply nobody
 * reads. Aliases are mentioned but not enumerated.
 */
export function renderHelp(options: { pnrEnabled: boolean }): string {
  const lines: string[] = [
    '**RailRadar bot commands**',
    '',
    'Put a command at the start of a line in any comment.',
    '',
    '| Command | What you get |',
    '|---|---|',
    '| `!live 12951` | Live running status, delay and next halt |',
    '| `!train 12951` | Schedule, run days and timetable |',
    '| `!between NDLS MMCT` | Direct trains between two stations |',
  ];

  if (options.pnrEnabled) {
    lines.push(
      '| `!pnr 1234567890` | Booking status and confirmation chance |'
    );
  }

  lines.push('| `!help` | This message |');
  lines.push('');
  lines.push('**Tips**');
  lines.push('');
  lines.push('- Train names work as well as numbers, e.g. `!live rajdhani`.');
  lines.push(
    '- `!between` needs station **codes** for now (`NDLS`, `MMCT`). Name search is coming soon.'
  );
  lines.push(
    '- Add a date to `!live` or `!between`, e.g. `!live 12951 tomorrow`.'
  );

  if (options.pnrEnabled) {
    lines.push(
      '- `!pnr` shows only aggregate status. Coach and berth are never posted.'
    );
  }

  lines.push('');
  lines.push(footer([]));

  return lines.join('\n');
}
