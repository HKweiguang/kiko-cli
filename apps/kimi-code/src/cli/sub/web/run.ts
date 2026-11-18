/**
 * `kiko web` — run the local REST/WebSocket server in the foreground.
 *
 * The server always runs in the current process, attached to the terminal,
 * and shuts down cleanly on SIGINT/SIGTERM. No browser UI is bundled or
 * served; the command prints the API base URL. Multiple instances can share
 * the home directory: each registers itself in the instance registry and
 * takes the next free port (see kap-server's `startServer`).
 */

import { createServerLogger, startServer, type ServerLogger } from '@moonshot-ai/kap-server';
import { shutdownTelemetry, track } from '@moonshot-ai/kimi-telemetry';
import chalk from 'chalk';
import { type Command, Option } from 'commander';

import { CLI_MSH_PLATFORM, CLI_SHUTDOWN_TIMEOUT_MS, CLI_USER_AGENT_PRODUCT, WEB_USER_AGENT_SUFFIX } from '#/constant/app';
import { darkColors } from '#/tui/theme/colors';
import { openUrl as defaultOpenUrl } from '#/utils/open-url';
import { getDataDir } from '#/utils/paths';
import { persistedKimiOAuthRef } from '#/utils/region';
import { generateRemoteControlQr } from '#/utils/remote-control-qr';

import { initializeServerTelemetry } from '../../telemetry';
import { createKimiCodeHostIdentity } from '../../host-identity';
import { getVersion } from '../../version';
import {
  accessUrlLines,
  buildApiUrl,
  isLoopbackHost,
} from './access-urls';
import { type NetworkAddress } from './networks';
import {
  formatRemoteControlOutput,
  formatRemoteControlStatus,
  startRemoteControl,
  type RemoteControlHandle,
  type RemoteControlOptions,
  type RemoteControlStatus,
} from './remote-control';
import {
  DEFAULT_FOREGROUND_LOG_LEVEL,
  DEFAULT_LAN_HOST,
  DEFAULT_SERVER_HOST,
  DEFAULT_SERVER_PORT,
  parseServerOptions,
  tryResolveServerToken,
  VALID_LOG_LEVELS,
  type ParsedServerOptions,
  type ServerCliOptions,
} from './shared';

/**
 * Minimal surface `runServerInProcess` needs from the server. kap-server's
 * `RunningServer` is adapted to it (it returns `{ host, port, close }`
 * instead of `{ address, logger, close }`).
 */
interface RoutedServer {
  readonly address: string;
  readonly logger: ServerLogger;
  close(): Promise<void>;
}

export interface WebCliOptions extends ServerCliOptions {
  open?: boolean;
  remoteControl?: boolean;
}

export interface ForegroundControls {
  /** Ask the foreground runner to shut the server down and exit (like SIGINT). */
  requestShutdown(reason: string): void;
}

export interface StartForegroundHooks {
  /** Fires once the server is listening, before the foreground runner blocks. */
  onReady?: (origin: string, controls?: ForegroundControls) => void | Promise<void>;
  onShutdown?: (reason: string) => void | Promise<void>;
}

export interface WebCommandDeps {
  /** Foreground runner; defaults to the real in-process runner when omitted. */
  startServerForeground?: (
    options: ParsedServerOptions,
    hooks?: StartForegroundHooks,
  ) => Promise<never>;
  startRemoteControl?: (options: RemoteControlOptions) => Promise<RemoteControlHandle>;
  openUrl(url: string): void;
  /**
   * Best-effort read of the server's persistent bearer token, printed in the
   * ready banner so API clients can authenticate. Optional so callers/tests
   * that don't supply it simply print the origin without a token line.
   */
  resolveToken?: () => string | undefined;
  /**
   * Non-loopback interface addresses to display for a wildcard bind. Defaults
   * to the machine's own interfaces (`listNetworkAddresses()`); inject a fixed
   * list in tests for deterministic output.
   */
  networkAddresses?: NetworkAddress[];
  stdout: Pick<NodeJS.WriteStream, 'write'>;
  stderr: Pick<NodeJS.WriteStream, 'write'>;
}

/** Build the `web` command, mounting the runner action on `cmd` itself. */
export function buildWebCommand(
  cmd: Command,
  opts: { forceRemoteControl?: boolean } = {},
): Command {
  const forceRemoteControl = opts.forceRemoteControl === true;
  const withServerOptions = cmd
    .option(
      '--port <port>',
      `Bind port (default ${DEFAULT_SERVER_PORT})`,
      String(DEFAULT_SERVER_PORT),
    )
    .option(
      '--host [host]',
      `Bind host. Omit to bind ${DEFAULT_SERVER_HOST} (this machine only); pass --host to bind ${DEFAULT_LAN_HOST} (all interfaces), or --host <host> for a specific host. The bearer token is printed at startup.`,
    )
    .option(
      '--allowed-host <host...>',
      'Extra Host header value to allow through the DNS-rebinding check. Repeat or comma-separate; a leading dot matches a domain suffix (e.g. .example.com).',
    )
    .option(
      '--insecure-no-tls',
      'Allow a non-loopback bind without a TLS-terminating reverse proxy. Defaults to true; only relevant for non-loopback binds.',
      true,
    )
    .option(
      '--allow-remote-shutdown',
      'On a non-loopback bind, keep POST /api/v1/shutdown enabled (default: route is disabled → 404).',
      false,
    )
    .option(
      '--dangerous-bypass-auth',
      'Disable bearer-token auth on every REST and WebSocket route, and advertise it via /api/v1/meta so clients connect without a token. Only use on a trusted network or behind your own authenticating proxy.',
      false,
    )
    .option(
      '--log-level <level>',
      `Server log level: ${VALID_LOG_LEVELS.join('|')}. Omit to keep logs off.`,
    )
    .option(
      '--debug-endpoints',
      'Mount /api/v1/debug/* routes for test introspection. OFF by default; production callers leave this unset.',
      false,
    )
    .option(
      '--web-title <title>',
      'Set a custom browser tab title for web clients, reported in /api/v1/meta (default: "<workspace dir> | Kiko").',
    );
  if (!forceRemoteControl) {
    withServerOptions.addOption(
      new Option(
        '--rc, --remote-control',
        'Expose the local server through Kimi Remote Control.',
      ).default(false),
    );
  }
  const openOption = forceRemoteControl
    ? new Option('--no-open', 'Do not open the Remote Control page in the default browser.')
    : new Option(
        '--no-open',
        'Deprecated: the local server no longer opens a browser. Still skips opening the Remote Control page when combined with --remote-control.',
      );
  return withServerOptions
    .addOption(openOption.default(true))
    .action(async (opts: WebCliOptions) => {
      try {
        await handleWebCommand(
          forceRemoteControl ? { ...opts, remoteControl: true } : opts,
        );
      } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
      }
    });
}

export async function handleWebCommand(
  opts: WebCliOptions,
  deps: WebCommandDeps = DEFAULT_WEB_COMMAND_DEPS,
): Promise<void> {
  const parsed = parseServerOptions(opts);
  if (opts.remoteControl === true && parsed.dangerousBypassAuth) {
    throw new Error('--remote-control cannot be combined with --dangerous-bypass-auth.');
  }
  if (opts.remoteControl === true && !isLoopbackHost(parsed.host)) {
    throw new Error('--remote-control requires a loopback host.');
  }
  const run = deps.startServerForeground ?? startServerForeground;
  let remoteControl: RemoteControlHandle | undefined;
  await run(parsed, {
    onReady: async (origin, controls) => {
      // Resolve the persistent token only once the server is up: a fresh
      // server writes `server.token` on first boot, so reading it beforehand
      // would miss first-time starts. It is printed in the ready banner so API
      // clients can authenticate. When auth is bypassed, the token is
      // meaningless and is intentionally NOT shown.
      const token = parsed.dangerousBypassAuth ? undefined : deps.resolveToken?.();
      if (opts.remoteControl === true) {
        if (token === undefined) throw new Error('Unable to read the local server token.');
        const dataDir = getDataDir();
        const persisted = persistedKimiOAuthRef();
        let outputReady = false;
        const pendingStatuses: string[] = [];
        const onStatus = (status: RemoteControlStatus): void => {
          const line = formatRemoteControlStatus(status);
          if (outputReady) deps.stdout.write(line);
          else pendingStatuses.push(line);
        };
        remoteControl = await (deps.startRemoteControl ?? startRemoteControl)({
          homeDir: dataDir,
          localOrigin: origin,
          localServerToken: token,
          clientVersion: `${CLI_USER_AGENT_PRODUCT}/${getVersion()}`,
          urlSource: CLI_MSH_PLATFORM,
          configuredOAuthKey: persisted?.key,
          configuredOAuthHost: persisted?.oauthHost,
          stderr: deps.stderr,
          onStatus,
        });
        void remoteControl.closed.then(
          (reason) => {
            if (reason === 'user_requested') {
              controls?.requestShutdown('remote_control_user_requested');
            }
          },
          (error) => {
            deps.stderr.write(
              `Remote Control lock release failed: ${error instanceof Error ? error.message : String(error)}\n`,
            );
            controls?.requestShutdown('remote_control_closed');
          },
        );
        const qrCode = await generateRemoteControlQr(remoteControl.url, dataDir);
        deps.stdout.write(
          formatRemoteControlOutput({
            url: remoteControl.url,
            localOrigin: origin,
            deviceName: remoteControl.deviceName,
            qrCode: qrCode.terminal,
            pngPath: qrCode.pngPath,
          }),
        );
        outputReady = true;
        for (const line of pendingStatuses) deps.stdout.write(line);
        if (opts.open === true) deps.openUrl(remoteControl.url);
        return;
      }
      deps.stdout.write(
        parsed.logLevel === DEFAULT_FOREGROUND_LOG_LEVEL
          ? formatReadyBanner(origin, parsed.host, {
              token,
              networkAddresses: deps.networkAddresses,
              dangerousBypassAuth: parsed.dangerousBypassAuth,
            })
          : formatReadyLine(origin, token, parsed.dangerousBypassAuth),
      );
    },
    onShutdown: async () => {
      await remoteControl?.close();
    },
  });
}

function formatReadyLine(
  origin: string,
  token: string | undefined,
  dangerousBypassAuth = false,
): string {
  const notice = dangerousBypassAuth
    ? `${formatDangerNoticeLines().join('\n')}\n`
    : '';
  const tokenLine = token === undefined ? '' : `Token: ${token}\n`;
  return `${notice}Kiko server: ${buildApiUrl(origin)}\n${tokenLine}`;
}

/**
 * Red, impossible-to-miss notice emitted when `--dangerous-bypass-auth`
 * disables the bearer-token gate. Shared by the full ready banner and the
 * compact one-line output so the warning always shows regardless of log level.
 */
function formatDangerNoticeLines(): string[] {
  const danger = (text: string): string => chalk.hex(darkColors.error)(text);
  const dangerBold = (text: string): string => chalk.bold.hex(darkColors.error)(text);
  return [
    `  ${dangerBold('⚠ DANGER: authentication is DISABLED (--dangerous-bypass-auth).')}`,
    `  ${danger('Anyone who can reach this port gets full access. Only continue if you understand the risk.')}`,
    `  ${danger('If you are unsure, stop this process now with ')}${dangerBold('Ctrl+C')}${danger('.')}`,
  ];
}

/**
 * `kiko web` — runs the local server in-process, attached to the current
 * terminal. Resolves only via `process.exit` (SIGINT/SIGTERM).
 */
export async function startServerForeground(
  options: ParsedServerOptions,
  hooks: StartForegroundHooks = {},
): Promise<never> {
  return runServerInProcess(options, hooks);
}

/**
 * Start the server in the current process and block until shutdown.
 * `onReady` fires once the server is listening.
 */
async function runServerInProcess(
  options: ParsedServerOptions,
  hooks: StartForegroundHooks,
): Promise<never> {
  const version = getVersion();
  // Registers the telemetry provider for `track` / `shutdownTelemetry`; the
  // client itself is not passed into kap-server.
  initializeServerTelemetry({ version });

  let running: RoutedServer | undefined;
  let stopping = false;

  async function shutdown(reason: string): Promise<void> {
    if (stopping) return;
    stopping = true;
    running?.logger.info({ reason }, 'server shutting down');
    try {
      await hooks.onShutdown?.(reason);
    } catch (error) {
      running?.logger.error(
        { err: error instanceof Error ? error : new Error(String(error)) },
        'foreground shutdown hook error',
      );
    }
    try {
      await running?.close();
      await shutdownTelemetry({ timeoutMs: CLI_SHUTDOWN_TIMEOUT_MS });
    } catch (error) {
      running?.logger.error(
        { err: error instanceof Error ? error : new Error(String(error)) },
        'server shutdown error',
      );
    }
    process.exit(0);
  }

  // kap-server (the DI × Scope engine server) is the only server flavor. Its
  // `startServer` returns `{ host, port, close }` rather than `{ address,
  // logger, close }`, so adapt it to the `RoutedServer` surface the rest of
  // this runner consumes.
  const logger = createServerLogger({ level: options.logLevel });
  const v2 = await startServer({
    host: options.host,
    port: options.port,
    // Report the CLI's product version as `server_version` (/meta)
    // rather than kap-server's private package version.
    serverVersion: version,
    // The CLI's host identity: feeds the engine's bootstrap client identity
    // and the derived outbound headers (User-Agent + X-Msh-*), so web-client
    // OAuth flows and model / WebSearch requests carry the CLI identity. The
    // `web` User-Agent suffix distinguishes web traffic from direct CLI
    // runs upstream (same product token, same platform).
    hostIdentity: {
      ...createKimiCodeHostIdentity(version),
      userAgentSuffix: WEB_USER_AGENT_SUFFIX,
    },
    logLevel: options.logLevel,
    logger,
    debugEndpoints: options.debugEndpoints,
    insecureNoTls: options.insecureNoTls,
    allowRemoteShutdown: options.allowRemoteShutdown,
    allowedHosts: options.allowedHosts,
    disableAuth: options.dangerousBypassAuth,
    webTitle: options.webTitle,
    // Attach the engine's cloud telemetry appender (still gated by the config
    // `telemetry` toggle). Complements the v1 client registered above, which
    // only covers host-level events.
    telemetry: true,
  });
  logger.info('serving the REST/WS API');
  running = {
    address: `http://${v2.host}:${v2.port}`,
    logger,
    close: () => v2.close(),
  };

  track('server_started', { daemon: false });

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  running.logger.info({ address: running.address }, 'server ready');

  try {
    await hooks.onReady?.(running.address, {
      requestShutdown: (reason) => void shutdown(reason),
    });
  } catch (error) {
    try {
      await hooks.onShutdown?.('startup_failed');
    } finally {
      await running.close();
      await shutdownTelemetry({ timeoutMs: CLI_SHUTDOWN_TIMEOUT_MS }).catch(() => {});
    }
    throw error;
  }

  return new Promise<never>(() => {
    // Keeps the event loop alive; the process ends via shutdown()/process.exit.
  });
}

interface FormatReadyBannerOptions {
  /** Persistent bearer token to print; omitted when unresolvable. */
  token?: string;
  /** Non-loopback interface addresses to list for a wildcard bind. */
  networkAddresses?: NetworkAddress[];
  /** When true, render a red danger notice (auth is disabled). */
  dangerousBypassAuth?: boolean;
}

export function formatReadyBanner(
  origin: string,
  host: string,
  opts: FormatReadyBannerOptions = {},
): string {
  const primary = (text: string): string => chalk.hex(darkColors.primary)(text);
  const title = (text: string): string => chalk.bold.hex(darkColors.primary)(text);
  const dim = (text: string): string => chalk.hex(darkColors.textDim)(text);
  const muted = (text: string): string => chalk.hex(darkColors.textMuted)(text);
  const label = (text: string): string => chalk.bold.hex(darkColors.textDim)(text);
  const url = (text: string): string => chalk.hex(darkColors.accent)(text);

  const port = Number(origin.slice(origin.lastIndexOf(':') + 1));
  // Borderless header: the Kimi sprite (the little mascot with eyes) sits next
  // to the title, keeping the brand without the enclosing box.
  const logo = ['▐█▛█▛█▌', '▐█████▌'] as const;
  const lines: string[] = [
    '',
    `  ${primary(logo[0])}  ${title('Kiko server ready')}  ${dim(getVersion())}`,
    `  ${primary(logo[1])}  ${dim('REST + WebSocket API only — the browser UI is no longer bundled.')}`,
    '',
  ];

  if (opts.dangerousBypassAuth === true) {
    // Red, impossible-to-miss notice: the bearer-token gate is off, so anyone
    // who can reach this port gets full session / filesystem / shell access.
    lines.push(...formatDangerNoticeLines(), '');
  }

  // REST API base URLs.
  for (const { label: text, url: href } of accessUrlLines(
    host,
    port,
    opts.networkAddresses,
  )) {
    lines.push(`  ${label(text)}${url(href)}`);
  }
  // On a loopback bind there is no network URL; show how to enable one.
  if (isLoopbackHost(host)) {
    lines.push(`  ${label('Network:  ')}${muted('off')}${dim('  use --host to enable')}`);
  }
  if (opts.token !== undefined) {
    // Set the token off with surrounding whitespace rather than color, so it is
    // easy to spot without being highlighted.
    lines.push('');
    lines.push(`  ${label('Token:    ')}${opts.token}`);
    lines.push('');
  }

  // Auxiliary controls last.
  lines.push(`  ${label('Logs:     ')}${muted('off')}${dim('  use --log-level info to enable')}`);
  // The server always runs in the foreground attached to this terminal.
  lines.push(`  ${label('Stop:     ')}${muted('Ctrl+C')}`);
  lines.push('');
  return lines.join('\n');
}

const DEFAULT_WEB_COMMAND_DEPS: WebCommandDeps = {
  startServerForeground,
  openUrl: defaultOpenUrl,
  resolveToken: () => {
    // Read the persistent `<homeDir>/server.token` written on first boot
    // (M5.1). Best-effort: a missing/older server yields undefined and the
    // banner prints no token line.
    return tryResolveServerToken(getDataDir());
  },
  stdout: process.stdout,
  stderr: process.stderr,
};
