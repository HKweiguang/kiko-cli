// Verify the prebuilt web bundle is present before packaging.
//
// apps/kimi-web no longer exists in this repo: the web UI is developed in the
// code-app repo (apps/web) and the built bundle is synced here and committed
// at apps/kimi-code/dist-web (gitignored, force-added). This script replaces
// the old copy-from-source step — it only checks that the committed bundle is
// in place and free of retired env-var names, so a packaging run never
// silently ships a CLI without the web UI or with a stale login prompt.

import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(appRoot, 'dist-web');
const TEXT_ASSET_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.html', '.json', '.map', '.svg', '.txt']);
const RETIRED_ENV_NAME = /\bKIMI_CODE_[A-Z0-9_]+\b/g;
const SYNC_HINT =
  'web 产物由 code-app 仓同步（见根 AGENTS.md），请从该仓运行 ' +
  '`KIMI_CODE_REPO=<此 checkout> pnpm run sync:web` 并提交 dist-web。';

async function assertWebAssets() {
  try {
    const info = await stat(resolve(target, 'index.html'));
    if (!info.isFile()) {
      throw new Error('index.html is not a file');
    }
  } catch {
    throw new Error(`未找到已提交的 web 产物 ${target}/index.html。${SYNC_HINT}`);
  }
}

async function assertNoRetiredEnvNames() {
  const offenders = [];
  for (const file of await readdir(target, { recursive: true })) {
    if (!TEXT_ASSET_EXTENSIONS.has(extname(file).toLowerCase())) continue;
    const text = await readFile(resolve(target, file), 'utf-8');
    const names = [...new Set(text.match(RETIRED_ENV_NAME) ?? [])];
    if (names.length > 0) offenders.push(`${file}: ${names.join(', ')}`);
  }
  if (offenders.length > 0) {
    throw new Error(
      'web 产物仍包含已废弃的环境变量名（服务端现在只读 KIKO_*，旧名不再生效）：\n' +
        offenders.map((entry) => `  - ${entry}`).join('\n') +
        `\n请先在 code-app 仓把登录页/i18n 文案与环境变量名改为 KIKO_*，再重新同步：${SYNC_HINT}`,
    );
  }
}

await assertWebAssets();
await assertNoRetiredEnvNames();
const files = await readdir(target, { recursive: true });
console.log(`Web assets OK: ${target} (${files.length} entries, synced from code-app)`);
