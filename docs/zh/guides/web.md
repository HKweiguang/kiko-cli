# 运行本地服务

`kiko web` 在当前终端的前台运行本地 Kiko 服务。它在同一端口上提供两个接口：`/api/v1` 的 REST API 和 `/api/v1/ws` 的 WebSocket 事件流。旧版本从这个地址提供的浏览器 web UI 已不再随包发布，也不再提供支持——客户端直接连接 API，[远程控制](./remote-control.md) 则提供托管的网页用于远程会话。

::: warning 注意
`kiko web` 不再打开浏览器，也不再提供 HTML 页面。启动横幅会打印 API 基础地址和 bearer token。要在浏览器中使用 Kiko，请使用 [远程控制](./remote-control.md)。
:::

## 开始使用

在终端运行 `kiko web`：

```sh
kiko web
```

命令会附着在当前终端前台运行，收到 `SIGINT` / `SIGTERM`（例如 `Ctrl-C`）时干净退出。服务就绪后，横幅会打印 API 地址和 token：

```text
Kiko server ready
REST + WebSocket API only — the browser UI is no longer bundled.

Local:    http://127.0.0.1:58627/api/v1
Token:    <token>

Logs:     off  use --log-level info to enable
Stop:     Ctrl+C
```

服务还会发布 `GET /openapi.json`（REST）和 `GET /asyncapi.json`（WebSocket）用于查询 schema，两者同样需要 bearer token。完整的接口参考和请求示例见 [服务 API](../reference/server-api.md)。

在 CLI 中，`/web` 会完成同样的交接：TUI 退出，当前进程变成前台服务。

### 启动选项

| 选项 | 说明 |
| --- | --- |
| `--port <port>` | 绑定端口；默认 `58627`，被占用时自动用 `port + 1` 重试 |
| `--host [host]` | 绑定地址；省略时为 `127.0.0.1`（仅本机），裸写 `--host` 为 `0.0.0.0`（所有网卡），也可指定具体地址 |
| `--allowed-host <host...>` | DNS 重绑定检查额外放行的 Host 头；可重复或逗号分隔 |
| `--log-level <level>` | 按所选级别开启服务日志；默认不输出 |
| `--debug-endpoints` | 挂载 `/api/v1/debug/*` 内省路由（默认关闭） |
| `--dangerous-bypass-auth` | 关闭所有 REST 与 WebSocket 路由的 bearer token 鉴权；仅在可信网络或自有鉴权代理之后使用 |
| `--web-title <title>` | 报告给 web 客户端的浏览器标签页标题；默认为工作区目录名 |
| `--no-open` | 已废弃；仅为兼容而接受。`kiko web` 不再打开浏览器 |

多个实例可以共享同一个 home 目录：每个实例都会注册到 `~/.kiko/server/instances/`，端口被占用时自动改用下一个空闲端口。

## 鉴权

所有 `/api/*` 路由都要求在 `Authorization: Bearer <token>` 请求头中携带 bearer token。WebSocket 升级请求可以使用同样的请求头，也可以使用子协议 `kimi-code.bearer.<token>`。token 保存在 `~/.kiko/server.token`，并在启动时打印。

运行 `kiko web rotate-token` 可以轮换 token。旧 token 立即失效，所有运行中的实例会在下一次鉴权检查时自动换用新 token，无需重启。

## 安全注意

- `kiko web` 默认只绑定 loopback。`--host` 会把 API 暴露到局域网；非 loopback 绑定前应在前置反向代理上终止 TLS。
- 绑定到 loopback 之外时，还可以设置 `KIKO_PASSWORD` 作为并列凭证——见 [环境变量](../configuration/env-vars.md)。
- `--dangerous-bypass-auth` 会完全关闭鉴权。任何能访问该端口的人都能控制你的会话、文件系统和 shell；仅在可信网络或自有鉴权代理之后使用。

## 常见问题

### 端口被占用了怎么办

不用处理。服务会自动用下一个端口重试（58628、58629……），以启动横幅里实际打印的地址为准。

### token 丢失或泄露了怎么办

运行 `kiko web rotate-token` 生成新 token。所有运行中的实例会自动换用新 token，API 客户端用新值重新连接即可。

### 浏览器界面去哪了

随包发布的浏览器界面已移除，`kiko web` 只提供 API。[远程控制](./remote-control.md) 仍提供托管的网页，通过 Kimi 中转连接本机。

### 同一局域网的其他设备能访问吗

启动时带上 `--host`，并使用横幅中打印的 `Network:` API 地址。每个客户端都必须携带 bearer token。确认电脑防火墙已放行该端口。

## 下一步

- [服务 API](../reference/server-api.md) — 面向脚本与第三方客户端的 REST / WebSocket 接口
- [远程控制](./remote-control.md) — 通过托管的网页在手机或另一台电脑上使用 Kiko
- [kiko 命令](../reference/kimi-command.md#kiko-web) — `kiko web` 的全部命令行选项
