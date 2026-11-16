import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const appRoot = resolve(import.meta.dirname, '../..');
const packageJson = JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf-8')) as {
  bin?: Record<string, string>;
};

describe('npm CLI installation', () => {
  it('publishes kiko as the only CLI binary', () => {
    expect(packageJson.bin).toEqual({ kiko: 'dist/main.mjs' });
  });

  it('leaves an existing kimi executable untouched during global postinstall', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'kiko-postinstall-'));
    const legacyDir = join(rootDir, 'legacy');
    const packageBinDir = join(rootDir, 'package-bin');
    const kimiPath = join(legacyDir, 'kimi');
    const legacyShim = '#!/usr/bin/env python3\nimport kimi_cli\n';
    const ownShim = '#!/bin/sh\n# @moonshot-ai/kimi-code\n';
    const shellPathProbe = join(rootDir, 'shell-path');

    try {
      await Promise.all([mkdir(legacyDir), mkdir(packageBinDir)]);
      await writeFile(kimiPath, legacyShim, 'utf-8');
      await chmod(kimiPath, 0o755);
      await writeFile(join(packageBinDir, 'kimi'), ownShim, 'utf-8');
      await chmod(join(packageBinDir, 'kimi'), 0o755);
      await writeFile(join(packageBinDir, 'kiko'), ownShim, 'utf-8');
      await chmod(join(packageBinDir, 'kiko'), 0o755);
      await writeFile(
        shellPathProbe,
        '#!/bin/sh\nprintf "<<<KIMI_PATH_BEGIN>>>%s<<<KIMI_PATH_END>>>\\n" "$PATH"\n',
        'utf-8',
      );
      await chmod(shellPathProbe, 0o755);
      const path = `${legacyDir}:${packageBinDir}`;

      const result = spawnSync(process.execPath, [join(appRoot, 'scripts/postinstall.mjs')], {
        encoding: 'utf-8',
        env: {
          ...process.env,
          PATH: path,
          SHELL: shellPathProbe,
          npm_config_global: 'true',
          npm_config_prefix: rootDir,
        },
      });

      expect(result.status).toBe(0);
      expect(await readFile(kimiPath, 'utf-8')).toBe(legacyShim);
      await expect(readFile(join(legacyDir, 'kimi-legacy'), 'utf-8')).rejects.toMatchObject({
        code: 'ENOENT',
      });
      expect(await readFile(join(packageBinDir, 'kiko'), 'utf-8')).toBe(ownShim);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
