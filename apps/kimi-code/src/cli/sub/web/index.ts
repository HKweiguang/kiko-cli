/**
 * `kiko web` — run the local Kiko REST/WebSocket server in the foreground.
 *
 * The command itself is the runner (`kiko web` = start the server). The
 * server stays attached to the terminal and stops with Ctrl+C, so there is no
 * kill/ps subcommand; the only management subcommand is `web rotate-token`
 * (rotate the home-wide bearer token). Servers left behind by pre-0.28.0
 * builds are cleaned up with `kiko server kill`. The browser UI is no longer
 * bundled or served.
 */

import type { Command } from 'commander';

import { registerDeprecatedServerCommand } from './deprecated-server';
import { registerRotateTokenCommand } from './rotate-token';
import { buildWebCommand } from './run';

export function registerWebCommand(program: Command): void {
  const web = buildWebCommand(
    program
      .command('web')
      .description('Run the local Kiko REST/WebSocket server.'),
  );
  registerRotateTokenCommand(web);
  registerDeprecatedServerCommand(program);
  buildWebCommand(
    program
      .command('rc')
      .alias('remote')
      .description('Run the local Kiko server and expose it through Remote Control.'),
    { forceRemoteControl: true },
  );
}
