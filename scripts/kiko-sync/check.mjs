#!/usr/bin/env node
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { checkPaths } from './engine.mjs';
import {
  HISTORY_PATH_PATTERNS,
  KNOWN_RESIDUALS,
  OVER_RENAME_RULES,
  PLATFORM_CONTEXT_ALLOWLIST,
  PLATFORM_IDENTITIES,
  PRODUCT_PHRASES,
} from './mapping.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

const USAGE = `Usage: node scripts/kiko-sync/check.mjs [paths...] [options]

Read-only scan for Kiko product copy and platform identities.

With no paths, scans the default product surfaces:
  apps/kimi-code/src, packages (source, README, package.json), docs/en, docs/zh,
  flake.nix, README.md, README.zh-CN.md, SECURITY.md

When paths are given, both the copy and identity scans are limited to them.

Options:
  --root <dir>        Repository root (default: the repo containing this script)
  --json              Print a JSON report
  --print-allowlist   Print the mapping and allowlist, then exit
  --help              Print this help
`;

function printAllowlist() {
  const lines = ['Product phrase rewrites:'];
  for (const phrase of PRODUCT_PHRASES) {
    lines.push(`  ${phrase.id}  ${phrase.pattern.source} -> ${phrase.replacement}`);
    lines.push(`    ${phrase.reason}`);
  }
  lines.push('', 'Platform context allowlist (Kimi Code stays):');
  for (const entry of PLATFORM_CONTEXT_ALLOWLIST) {
    lines.push(`  ${entry.id}  ${entry.pattern.source}`);
    lines.push(`    ${entry.reason}`);
  }
  lines.push('', 'Platform identities (values that stay unchanged):');
  for (const identity of PLATFORM_IDENTITIES) {
    lines.push(`  ${identity.id}  ${identity.value}  (${identity.evidence})`);
    lines.push(`    ${identity.reason}`);
  }
  lines.push('', 'Over-rename rules (Kiko forms that fail the check):');
  for (const rule of OVER_RENAME_RULES) {
    lines.push(`  ${rule.id}  ${rule.pattern.source}`);
    if (rule.context !== undefined) lines.push(`    context: ${rule.context.source}`);
    lines.push(`    ${rule.reason}`);
  }
  lines.push('', 'History paths (product copy and command checks exempt):');
  for (const pattern of HISTORY_PATH_PATTERNS) lines.push(`  ${pattern.source}`);
  lines.push('', 'Known residuals (suppressed, tracked outside the harness scope):');
  for (const residual of KNOWN_RESIDUALS) {
    lines.push(`  ${residual.id}  ${residual.path.source}  ${residual.pattern.source}`);
    lines.push(`    ${residual.reason} (${residual.finding})`);
  }
  console.log(lines.join('\n'));
}

function formatReport(report) {
  const lines = [`Scanned ${report.scannedFiles} file(s) under ${report.root}`];
  if (report.ok) {
    lines.push('No violations.');
  } else {
    lines.push(`${report.violations.length} violation(s):`);
    for (const violation of report.violations) {
      lines.push(
        `  ${violation.file}:${violation.line}:${violation.column}  ${violation.kind}  ${violation.text}  (${violation.rule}) ${violation.message}`,
      );
    }
  }
  if (report.suppressed.length > 0) {
    lines.push(`Known residual(s) suppressed: ${report.suppressed.length}`);
    for (const residual of report.suppressed) {
      lines.push(
        `  ${residual.file}:${residual.line}:${residual.column}  ${residual.text}  ${residual.reason} (${residual.finding})`,
      );
    }
  }
  return lines.join('\n');
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      root: { type: 'string' },
      json: { type: 'boolean', default: false },
      'print-allowlist': { type: 'boolean', default: false },
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
if (values['print-allowlist']) {
  printAllowlist();
  process.exit(0);
}

let report;
try {
  report = checkPaths({ root: values.root ?? REPO_ROOT, paths: positionals });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

console.log(values.json ? JSON.stringify(report, null, 2) : formatReport(report));
process.exit(report.ok ? 0 : 1);