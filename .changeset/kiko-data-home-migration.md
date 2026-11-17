---
"@moonshot-ai/kimi-code": patch
---

Move the data directory to `~/.kiko`, copying an existing `~/.kimi-code` directory and keeping it as a backup; `KIMI_CODE_HOME` is still honored, and `KIKO_HOME_MIGRATION=off` keeps using `~/.kimi-code`.