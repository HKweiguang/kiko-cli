import { getVersion } from '#/cli/version';
import { CLI_MSH_PLATFORM, CLI_USER_AGENT_PRODUCT } from '#/constant/app';
import {
  buildRemoteControlUrl,
  formatRemoteControlAlreadyRunning,
  formatRemoteControlOutput,
  formatRemoteControlStatus,
  inspectRemoteControlLock,
  startRemoteControl,
  type RemoteControlStatus,
} from '#/cli/sub/web/remote-control';
import { formatReadyBanner, startServerForeground } from '#/cli/sub/web/run';
import { parseServerOptions, tryResolveServerToken } from '#/cli/sub/web/shared';
import { openUrl } from '#/utils/open-url';
import { getDataDir } from '#/utils/paths';
import { persistedKimiOAuthRef } from '#/utils/region';
import { generateRemoteControlQr } from '#/utils/remote-control-qr';

import { formatErrorMessage } from '../utils/event-payload';
import type { SlashCommandHost } from './dispatch';

/**
 * `/web` — start the local REST/WebSocket server in the foreground.
 *
 * The TUI shuts down and this process becomes the server, running in the
 * foreground attached to this terminal and taking the next free port
 * alongside any running ones. No browser UI is bundled or served; the ready
 * banner prints the API base URL and token instead.
 */
export async function handleWebCommand(host: SlashCommandHost): Promise<void> {
  host.setExitForegroundTask(async () => {
    const options = parseServerOptions({});
    try {
      await startServerForeground(options, {
        onReady: (origin) => {
          // Resolve the token here (after the server is listening): a fresh
          // server writes `server.token` on first boot, so reading it earlier
          // would miss first-time starts.
          const token = tryResolveServerToken(getDataDir());
          process.stdout.write(formatReadyBanner(origin, options.host, { token }));
          process.stdout.write(
            '\n  The browser web UI is no longer bundled; use the REST/WS API above.\n',
          );
        },
      });
    } catch (error) {
      process.stderr.write(`Failed to start server: ${formatErrorMessage(error)}\n`);
      process.exit(1);
    }
  });
  await host.stop();
}

export async function handleRemoteControlCommand(host: SlashCommandHost): Promise<void> {
  await host.waitForSessionAssembly();
  const session = host.session;

  const holder = await inspectRemoteControlLock(getDataDir());
  if (holder !== undefined) {
    host.showError(formatRemoteControlAlreadyRunning(holder));
    return;
  }

  host.setExitForegroundTask(async () => {
    const options = parseServerOptions({});
    let remoteControl: Awaited<ReturnType<typeof startRemoteControl>> | undefined;
    try {
      await startServerForeground(options, {
        onReady: async (origin, controls) => {
          const dataDir = getDataDir();
          const token = tryResolveServerToken(dataDir);
          if (token === undefined) throw new Error('Unable to read the local server token.');
          const persisted = persistedKimiOAuthRef();
          let outputReady = false;
          const pendingStatuses: string[] = [];
          const onStatus = (status: RemoteControlStatus): void => {
            const line = formatRemoteControlStatus(status);
            if (outputReady) process.stdout.write(line);
            else pendingStatuses.push(line);
          };
          remoteControl = await startRemoteControl({
            homeDir: dataDir,
            localOrigin: origin,
            localServerToken: token,
            clientVersion: `${CLI_USER_AGENT_PRODUCT}/${getVersion()}`,
            urlSource: CLI_MSH_PLATFORM,
            configuredOAuthKey: persisted?.key,
            configuredOAuthHost: persisted?.oauthHost,
            onStatus,
          });
          void remoteControl.closed.then(
            (reason) => {
              if (reason === 'user_requested') {
                controls?.requestShutdown('remote_control_user_requested');
              }
            },
            (error) => {
              process.stderr.write(
                `Remote Control lock release failed: ${formatErrorMessage(error)}\n`,
              );
              controls?.requestShutdown('remote_control_closed');
            },
          );
          const url = buildRemoteControlUrl(
            remoteControl.deviceId,
            session?.id,
            remoteControl.relayOrigin,
            CLI_MSH_PLATFORM,
          );
          const qrCode = await generateRemoteControlQr(url, dataDir);
          process.stdout.write(
            formatRemoteControlOutput({
              url,
              localOrigin: origin,
              deviceName: remoteControl.deviceName,
              qrCode: qrCode.terminal,
              pngPath: qrCode.pngPath,
            }),
          );
          outputReady = true;
          for (const line of pendingStatuses) process.stdout.write(line);
          openUrl(url);
        },
        onShutdown: async () => {
          await remoteControl?.close();
        },
      });
    } catch (error) {
      process.stderr.write(`Failed to start Remote Control: ${formatErrorMessage(error)}\n`);
      process.exit(1);
    }
  });
  await host.stop();
}
