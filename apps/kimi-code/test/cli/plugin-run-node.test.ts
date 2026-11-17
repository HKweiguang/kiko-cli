/**
 * Scenario: the hidden `__plugin_run_node` entry contract — the plugin root
 * comes from `KIKO_PLUGIN_ROOT` only, and the entry must resolve inside it.
 * Responsibilities: env contract (the old `KIMI_PLUGIN_ROOT` name is not
 * read), path containment, argv handoff to the plugin script.
 * Wiring: real temp plugin dirs and dynamic import; process env/argv restored.
 * Run: pnpm -C apps/kimi-code exec vitest run test/cli/plugin-run-node.test.ts
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runPluginNodeEntry } from '#/cli/sub/plugin-run-node';

describe('runPluginNodeEntry', () => {
  let root: string;
  let savedEnv: Record<string, string | undefined>;
  let savedArgv: string[];

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'plugin-run-node-'));
    savedEnv = {
      KIKO_PLUGIN_ROOT: process.env['KIKO_PLUGIN_ROOT'],
      KIMI_PLUGIN_ROOT: process.env['KIMI_PLUGIN_ROOT'],
    };
    savedArgv = process.argv;
  });

  afterEach(async () => {
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    process.argv = savedArgv;
    await rm(root, { recursive: true, force: true });
  });

  it('runs the entry with argv from the root named by KIKO_PLUGIN_ROOT', async () => {
    const marker = join(root, 'marker.txt');
    const entry = join(root, 'entry.mjs');
    await writeFile(
      entry,
      `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, process.argv.slice(2).join(' '));\n`,
      'utf8',
    );
    delete process.env['KIMI_PLUGIN_ROOT'];
    process.env['KIKO_PLUGIN_ROOT'] = root;

    await runPluginNodeEntry(entry, ['alpha', 'beta']);

    expect(await readFile(marker, 'utf8')).toBe('alpha beta');
  });

  it('does not read the legacy KIMI_PLUGIN_ROOT name', async () => {
    delete process.env['KIKO_PLUGIN_ROOT'];
    process.env['KIMI_PLUGIN_ROOT'] = root;

    await expect(runPluginNodeEntry(join(root, 'entry.mjs'), [])).rejects.toThrow(
      'KIKO_PLUGIN_ROOT is required to run a plugin node entry.',
    );
  });

  it('rejects an entry outside the plugin root', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'plugin-run-node-outside-'));
    try {
      const entry = join(outside, 'entry.mjs');
      await writeFile(entry, 'export {};\n', 'utf8');
      process.env['KIKO_PLUGIN_ROOT'] = root;

      await expect(runPluginNodeEntry(entry, [])).rejects.toThrow(
        `Plugin node entry must be inside KIKO_PLUGIN_ROOT: ${entry}`,
      );
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
