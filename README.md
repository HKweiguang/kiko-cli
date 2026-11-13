# Kiko CLI

[English](./README.md) · [中文](./README.zh-CN.md)

Kiko CLI is a customized branch of [Kimi Code CLI](https://github.com/MoonshotAI/kimi-code), carrying Kiko's own enhancements for a terminal coding agent.

> Status: aligned with upstream `main`; Kiko-specific changes have not landed yet.

## Relationship to upstream

- **Upstream**: `MoonshotAI/kimi-code`. This repository tracks its `main` branch.
- **Customizations**: Kiko's own changes are preserved across upstream syncs.
- **Downstream**: the CLI foundation for `kiko-desktop`.

## Development

The repository layout matches upstream. For build, test and usage instructions, see the [upstream README](https://github.com/MoonshotAI/kimi-code#readme) and the [documentation](https://moonshotai.github.io/kimi-code/en/).

Sync with upstream:

```bash
git fetch upstream
git merge upstream/main
```

## License

MIT, Copyright (c) 2026 Moonshot AI. See [LICENSE](./LICENSE).
