# Run the local server

`kiko web` runs the local Kiko server in the foreground of the current terminal. It exposes two interfaces on the same port: a REST API at `/api/v1` and a WebSocket event stream at `/api/v1/ws`. The browser web UI that older versions served from this address is no longer bundled or supported — clients connect to the API directly, and [Remote Control](./remote-control.md) provides a hosted web page for remote sessions.

::: warning
`kiko web` no longer opens a browser or serves HTML. The startup banner prints the API base URL and the bearer token instead. To use Kiko in a browser, use [Remote Control](./remote-control.md).
:::

## Getting started

Run `kiko web` in a terminal:

```sh
kiko web
```

The command stays attached to the terminal and shuts down cleanly on `SIGINT` / `SIGTERM` (e.g. `Ctrl-C`). Once the server is listening, the banner prints the API address and token:

```text
Kiko server ready
REST + WebSocket API only — the browser UI is no longer bundled.

Local:    http://127.0.0.1:58627/api/v1
Token:    <token>

Logs:     off  use --log-level info to enable
Stop:     Ctrl+C
```

The server also publishes `GET /openapi.json` (REST) and `GET /asyncapi.json` (WebSocket) for schema discovery; both require the same bearer token. For the endpoint reference and a complete request walkthrough, see [Server API](../reference/server-api.md).

Inside the CLI, `/web` performs the same handoff: the TUI exits and this process becomes the foreground server.

### Startup options

| Option | Description |
| --- | --- |
| `--port <port>` | Bind port; defaults to `58627`, and a busy port is retried with `port + 1` |
| `--host [host]` | Bind host; omit for `127.0.0.1` (this machine only), pass a bare `--host` for `0.0.0.0` (all interfaces), or pass a specific address |
| `--allowed-host <host...>` | Extra Host header values allowed through the DNS-rebinding check; repeatable or comma-separated |
| `--log-level <level>` | Enable server logs at the selected level; omitted by default |
| `--debug-endpoints` | Mount `/api/v1/debug/*` introspection routes (off by default) |
| `--dangerous-bypass-auth` | Disable bearer-token auth on every REST and WebSocket route; only for trusted networks or behind an authenticating proxy |
| `--web-title <title>` | Custom browser tab title reported to web clients; defaults to the workspace directory name |
| `--no-open` | Deprecated; accepted for compatibility. `kiko web` no longer opens a browser |

Multiple instances can share one home directory: each registers itself under `~/.kiko/server/instances/`, and a busy port is retried with the next free one.

## Authentication

All `/api/*` routes require the bearer token in the `Authorization: Bearer <token>` header. The WebSocket upgrade request accepts the same header or the subprotocol `kimi-code.bearer.<token>`. The token is stored in `~/.kiko/server.token` and printed at startup.

Rotate it with `kiko web rotate-token`. The previous token stops working immediately, and every running instance picks up the new token on its next auth check — no restart needed.

## Security notes

- `kiko web` binds to loopback only by default. `--host` exposes the API to your network; put a TLS-terminating reverse proxy in front of any non-loopback bind.
- When binding beyond loopback, you can also set `KIKO_PASSWORD` as a parallel credential — see [Environment variables](../configuration/env-vars.md).
- `--dangerous-bypass-auth` disables authentication entirely. Anyone who can reach the port gets full access to your sessions, filesystem, and shell; only use it on a trusted network or behind your own authenticating proxy.

## FAQ

### The port is already in use

Nothing to do. The server automatically retries with the next port (58628, 58629, …); use the address printed in the startup banner.

### I lost or leaked the token

Run `kiko web rotate-token` to generate a new token. All running instances switch to it automatically, so reconnect API clients with the new value.

### Where did the browser UI go?

The bundled browser UI was removed; `kiko web` is API-only. [Remote Control](./remote-control.md) still provides a hosted web page that connects to this machine over the Kimi relay.

### Can I reach the server from another device on my network?

Start with `--host` and use one of the `Network:` API URLs printed in the banner. The bearer token is required from every client. Make sure the machine's firewall allows the port.

## Next steps

- [Server API](../reference/server-api.md) — REST and WebSocket endpoints for scripts and third-party clients
- [Remote Control](./remote-control.md) — use Kiko from a phone or another computer through the hosted web page
- [kiko command](../reference/kimi-command.md#kiko-web) — all `kiko web` command-line options
