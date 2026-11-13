# Kiko CLI

[English](./README.md) · [中文](./README.zh-CN.md)

Kiko CLI 是 [Kimi Code CLI](https://github.com/MoonshotAI/kimi-code) 的定制分支，承载 kiko 在终端编码 Agent 上的自有增强。

> 当前状态：已与上游 `main` 对齐，kiko 的定制改动尚未落地。

## 与上游的关系

- **上游**：`MoonshotAI/kimi-code`，本仓库以它的 `main` 为基线跟进同步。
- **定制**：kiko 自有改动在同步上游时保留，不被覆盖。
- **下游**：`kiko-desktop` 的 CLI 基础。

## 开发

仓库结构与上游一致。构建、测试与使用说明参见[上游 README](https://github.com/MoonshotAI/kimi-code#readme)与[文档](https://moonshotai.github.io/kimi-code/zh/)。

同步上游：

```bash
git fetch upstream
git merge upstream/main
```

## 许可

MIT，版权归 Moonshot AI 所有，见 [LICENSE](./LICENSE)。
