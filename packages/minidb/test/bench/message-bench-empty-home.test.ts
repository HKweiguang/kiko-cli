// test/bench/message-bench-empty-home.test.ts
//
// Regression: a home whose session index yields zero real messages (only
// tombstones, or no session_index.jsonl at all) used to crash the scaled
// generators with `real[i % real.length]` -> TypeError, exiting 1. The benches
// must exit 0 with a clear notice and must not fabricate scaled results.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPTS = ['message-composed.ts', 'message-range.ts'];
const NOTICE = 'no real messages available';

async function runBench(script: string, home: string): Promise<string> {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['--import', 'tsx', path.join(pkgDir, 'bench', script)],
    {
      cwd: pkgDir,
      timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, HOME: home, USERPROFILE: home },
    },
  );
  return stdout;
}

async function makeHome(indexLines: string[] | undefined): Promise<string> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'minidb-bench-home-'));
  if (indexLines !== undefined) {
    const kikoDir = path.join(home, '.kiko');
    await fs.mkdir(kikoDir, { recursive: true });
    await fs.writeFile(path.join(kikoDir, 'session_index.jsonl'), indexLines.map((line) => line + '\n').join(''));
  }
  return home;
}

for (const script of SCRIPTS) {
  test(`${script} exits 0 on a tombstone-only session index`, { timeout: 60_000 }, async () => {
    const home = await makeHome([
      JSON.stringify({ sessionId: 'session_a', deleted: true }),
      JSON.stringify({ sessionId: 'session_b', deleted: true }),
    ]);
    try {
      const stdout = await runBench(script, home);
      assert.ok(stdout.includes('loaded 0 real'), stdout);
      assert.ok(stdout.includes(NOTICE), stdout);
      assert.ok(!stdout.includes('scaled'), stdout);
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  });

  test(`${script} exits 0 when the home has no session index`, { timeout: 60_000 }, async () => {
    const home = await makeHome(undefined);
    try {
      const stdout = await runBench(script, home);
      assert.ok(stdout.includes(NOTICE), stdout);
      assert.ok(!stdout.includes('scaled'), stdout);
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  });
}