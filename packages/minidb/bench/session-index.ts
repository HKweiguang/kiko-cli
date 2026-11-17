// bench/session-index.ts
//
// Session index reader for the bench scripts. `session_index.jsonl` is an
// append log: a live session appends {sessionId, sessionDir, workDir}, and
// deleting a session appends a tombstone {sessionId, deleted: true} with no
// sessionDir. Only complete, non-tombstone lines can be mapped to a session
// directory.

import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface BenchSessionIndexEntry {
  sessionId: string;
  sessionDir: string;
  workDir: string;
}

export function parseSessionIndexLine(line: string): BenchSessionIndexEntry | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const entry = parsed as Partial<BenchSessionIndexEntry> & { deleted?: unknown };
  if (entry.deleted === true) return undefined;
  if (typeof entry.sessionId !== 'string' || typeof entry.sessionDir !== 'string') return undefined;
  return {
    sessionId: entry.sessionId,
    sessionDir: entry.sessionDir,
    workDir: typeof entry.workDir === 'string' ? entry.workDir : '',
  };
}

export function readSessionIndexEntries(homeDir: string): BenchSessionIndexEntry[] {
  const raw = readFileSync(path.join(homeDir, 'session_index.jsonl'), 'utf8');
  const entries: BenchSessionIndexEntry[] = [];
  for (const line of raw.split('\n')) {
    const entry = parseSessionIndexLine(line);
    if (entry !== undefined) entries.push(entry);
  }
  return entries;
}