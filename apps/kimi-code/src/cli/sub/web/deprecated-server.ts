/**
 * Deprecated `kiko server` shim.
 *
 * The `kiko server` command tree was replaced by `kiko web` (the foreground
 * REST/WebSocket server). Any `kiko server …` invocation — bare or
 * with any legacy subcommand/flags — lands here, prints the deprecation
 * notice, and exits 1. The shim itself is scheduled for removal in the next
 * major version of Kiko.
 *
 * Two subcommands stay functional: `kiko server kill`, the cleanup path for
 * background servers started by pre-0.28.0 builds (recorded in the legacy
 * single-instance lock, which the instance registry never sees), and the
 * hidden `kiko server ensure-daemon`, the internal bootstrap the SSH host
 * bridge runs on the remote — the subcommand name is part of the host
 * protocol and must stay `server ensure-daemon`.
 */

import type { Command } from 'commander';

import { registerEnsureDaemonCommand } from './ensure-daemon';
import { registerLegacyKillCommand } from './legacy-kill';

export const DEPRECATED_SERVER_NOTICE =
  '`kiko server` has been deprecated and no longer works.\n' +
  'Use `kiko web` instead — it runs the local REST/WebSocket server in the foreground.\n' +
  'To stop a server started by a version before 0.28.0, use `kiko server kill`.\n' +
  'This notice will be removed in the next major version of Kiko.\n';

export function registerDeprecatedServerCommand(program: Command): void {
  const server = program
    .command('server')
    .description('Deprecated — use `kiko web` instead.')
    // Swallow every legacy subcommand/flag (`run`, `kill`, `--port`, …) so
    // they all land in the same notice instead of a commander parse error.
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(() => {
      process.stderr.write(DEPRECATED_SERVER_NOTICE);
      process.exit(1);
    });
  registerEnsureDaemonCommand(server);
  registerLegacyKillCommand(server);
}