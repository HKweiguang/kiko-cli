---
"@moonshot-ai/kimi-code": minor
---

Stop supporting legacy Kimi Code names: `KIMI_CODE_*` environment variables, `~/.kimi-code`, and project-level `.kimi-code/` configuration are no longer read; the old directories are left in place, so move anything you need to `KIKO_*`, `~/.kiko`, and `.kiko/` yourself.