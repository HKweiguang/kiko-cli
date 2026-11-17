// test/bench/session-index.test.js
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseSessionIndexLine, readSessionIndexEntries } from '../../bench/session-index.js';

const SESSION_DIR = '/home/example/.kiko/sessions/wm_example/session_example';

test('parseSessionIndexLine keeps a valid entry unchanged', () => {
  const entry = { sessionId: 'session_example', sessionDir: SESSION_DIR, workDir: '/work/example' };
  assert.deepEqual(parseSessionIndexLine(JSON.stringify(entry)), entry);
});

test('parseSessionIndexLine skips a deleted tombstone', () => {
  const line = JSON.stringify({ sessionId: 'session_deleted', deleted: true });
  assert.equal(parseSessionIndexLine(line), undefined);
});

test('parseSessionIndexLine skips an entry without sessionDir', () => {
  const line = JSON.stringify({ sessionId: 'session_no_dir', workDir: '/work/example' });
  assert.equal(parseSessionIndexLine(line), undefined);
});

test('readSessionIndexEntries keeps the valid sessions of a home with tombstones', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'minidb-session-index-'));
  try {
    const valid = [
      { sessionId: 'session_a', sessionDir: SESSION_DIR + '_a', workDir: '/work/example' },
      { sessionId: 'session_b', sessionDir: SESSION_DIR + '_b', workDir: '/work/example' },
    ];
    const lines = [
      JSON.stringify({ sessionId: 'session_deleted', deleted: true }),
      JSON.stringify(valid[0]),
      'not json',
      JSON.stringify({ sessionId: 'session_no_dir', workDir: '/work/example' }),
      JSON.stringify(valid[1]),
    ];
    await fs.writeFile(path.join(home, 'session_index.jsonl'), lines.join('\n') + '\n');

    assert.deepEqual(readSessionIndexEntries(home), valid);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});