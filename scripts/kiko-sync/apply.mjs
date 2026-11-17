#!/usr/bin/env node
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { applyPaths } from './engine.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

const USAGE = `Usage: node scripts/kiko-sync/apply.mjs <paths...> [options]

Rewrite upstream Kimi Code product copy to Kiko in the given files or directories.
Comments in script files, platform identities, and over-renamed Kiko forms are left
alone. Markdown is treated as copy, including HTML comments and fenced code blocks.

Options:
  --root <dir>          Repository root (default: the repo containing this script)
  --dry-run             Report changes without writing files
  --include-history     Also rewrite changelogs, changesets, and migration guides
  --include-manifests   Also rewrite package.json, flake.nix, native scripts, and
                        packages/*/README.md (.github is always skipped)
  --include-tests       Also rewrite test files and fixtures
  --help                Print this help
`;

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      root: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'include-history': { type: 'boolean', default: false },
      'include-manifests': { type: 'boolean', default: false },
      'include-tests': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(USAGE);
  process.exit(2);
}

const { values, positionals } = parsed;
if (values.help) {
  console.log(USAGE);
  process.exit(0);
}
if (positionals.length === 0) {
  console.error('At least one path is required.');
  console.error(USAGE);
  process.exit(2);
}

let result;
try {
  result = applyPaths({
    root: values.root ?? REPO_ROOT,
    paths: positionals,
    dryRun: values['dry-run'],
    includeHistory: values['include-history'],
    includeManifests: values['include-manifests'],
    includeTests: values['include-tests'],
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const heading = result.dryRun ? 'Kiko rename apply (dry run)' : 'Kiko rename apply';
const lines = [heading];
if (result.changed.length === 0) {
  lines.push('No changes.');
} else {
  const verb = result.dryRun ? 'Would replace' : 'Replaced';
  lines.push(`${verb} ${result.totalReplacements} occurrence(s) in ${result.changed.length} file(s):`);
  for (const entry of result.changed) lines.push(`  ${entry.file}  ${entry.replacements}`);
}
if (result.skipped.length > 0) {
  lines.push(`Skipped ${result.skipped.length} file(s):`);
  for (const entry of result.skipped) lines.push(`  ${entry.file}  ${entry.reason}`);
}
console.log(lines.join('\n'));