import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const CLI_SRC_ROOT = join(__dirname, '..', '..', 'src', 'cli');
const WEB_SRC_ROOT = join(CLI_SRC_ROOT, 'sub', 'web');
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const HARNESS_CHECK = join(REPO_ROOT, 'scripts', 'kiko-sync', 'check.mjs');

const PRODUCT_COPY_PATTERN = /Kimi Code/g;
const SERVER_COPY_PATTERN = /Kimi server/g;

interface SourceRange {
  readonly start: number;
  readonly end: number;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

/**
 * Ranges of `source` outside `//` and block comments. String literals stay
 * included, so user-visible copy is scanned while comments (which may keep
 * historical names) are ignored.
 */
function nonCommentRanges(source: string): SourceRange[] {
  const ranges: SourceRange[] = [];
  let rangeStart = 0;
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '/' && next === '/') {
      ranges.push({ start: rangeStart, end: index });
      const lineEnd = source.indexOf('\n', index);
      if (lineEnd === -1) return ranges;
      index = lineEnd;
      rangeStart = lineEnd;
      continue;
    }
    if (char === '/' && next === '*') {
      ranges.push({ start: rangeStart, end: index });
      const commentEnd = source.indexOf('*/', index + 2);
      if (commentEnd === -1) return ranges;
      index = commentEnd + 2;
      rangeStart = index;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      index++;
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2;
          continue;
        }
        if (source[index] === char) {
          index++;
          break;
        }
        index++;
      }
      continue;
    }
    index++;
  }
  ranges.push({ start: rangeStart, end: source.length });
  return ranges;
}

function isHistoricalMigrationReference(line: string): boolean {
  return line.includes('KIMI_SHARE_DIR') && line.includes('Kimi Code home');
}

function collectOffenders(
  file: string,
  source: string,
  pattern: RegExp,
  isExempt: (line: string) => boolean = () => false,
): string[] {
  const offenders: string[] = [];
  const lines = source.split('\n');
  for (const range of nonCommentRanges(source)) {
    const segment = source.slice(range.start, range.end);
    for (const match of segment.matchAll(pattern)) {
      const absoluteIndex = range.start + (match.index ?? 0);
      const lineNumber = source.slice(0, absoluteIndex).split('\n').length;
      const line = lines[lineNumber - 1] ?? '';
      if (isExempt(line)) continue;
      offenders.push(`${relative(CLI_SRC_ROOT, file)}:${String(lineNumber)}  ${line.trim()}`);
    }
  }
  return offenders;
}

describe('CLI product copy guard', () => {
  it('leaves no user-visible "Kimi Code" copy in src/cli', () => {
    const offenders = walk(CLI_SRC_ROOT).flatMap((file) =>
      collectOffenders(
        file,
        readFileSync(file, 'utf8'),
        PRODUCT_COPY_PATTERN,
        isHistoricalMigrationReference,
      ),
    );
    expect(
      offenders,
      'User-visible product copy in apps/kimi-code/src/cli must use Kiko/Kiko CLI. ' +
        'Comments and the KIMI_SHARE_DIR historical migration notice are exempt.\n' +
        offenders.map((offender) => `  ${offender}`).join('\n'),
    ).toEqual([]);
  });

  it('leaves no user-visible "Kimi server" copy in src/cli/sub/web', () => {
    const offenders = walk(WEB_SRC_ROOT).flatMap((file) =>
      collectOffenders(file, readFileSync(file, 'utf8'), SERVER_COPY_PATTERN),
    );
    expect(
      offenders,
      'User-visible server copy in apps/kimi-code/src/cli/sub/web must use Kiko server. ' +
        'Comments are exempt.\n' +
        offenders.map((offender) => `  ${offender}`).join('\n'),
    ).toEqual([]);
  });

  it('passes the kiko-sync harness check across all of src', () => {
    const result = spawnSync(process.execPath, [HARNESS_CHECK, '--json', 'apps/kimi-code/src'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    const report = JSON.parse(result.stdout) as {
      ok: boolean;
      violations: unknown[];
    };
    expect(report.ok).toBe(true);
    expect(report.violations).toEqual([]);
  });
});