import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';

import { applyPaths, checkPaths, maskComments } from '../engine.mjs';
import {
  KNOWN_RESIDUALS,
  LEGACY_COMMAND_PATTERNS,
  OVER_RENAME_RULES,
  PLATFORM_CONTEXT_ALLOWLIST,
  PLATFORM_IDENTITIES,
  PRODUCT_PHRASES,
} from '../mapping.mjs';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');
const CHECK_CLI = resolve(import.meta.dirname, '..', 'check.mjs');

function withFixture(name, run) {
  const root = mkdtempSync(join(tmpdir(), 'kiko-sync-'));
  cpSync(join(FIXTURES, name), root, { recursive: true });
  try {
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function snapshot(root) {
  const files = new Map();
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        files.set(relative(root, absolute), readFileSync(absolute, 'utf8'));
      }
    }
  };
  visit(root);
  return files;
}

function read(root, relPath) {
  return readFileSync(join(root, relPath), 'utf8');
}

await test('apply rewrites product copy and legacy commands but keeps comments and platform identities', () => {
  withFixture('apply-tree', (root) => {
    const result = applyPaths({ root, paths: ['.'] });
    assert.equal(result.totalReplacements, 5);
    assert.deepEqual(
      result.skipped.map((entry) => entry.reason),
      ['history', 'manifest', 'manifest', 'test'],
    );

    const source = read(root, 'product.ts');
    assert.match(source, /Welcome to Kiko CLI/);
    assert.match(source, /export const productName = 'Kiko';/);
    assert.match(source, /run `kiko web` to open the UI/);
    assert.match(source, /output of `kiko --version`/);
    assert.match(source, /https:\/\/example\.test\/Kiko/);
    assert.match(source, /\/\/ Kimi Code in a comment stays unchanged\./);
    assert.match(source, /'Kimi Code OAuth'/);
    assert.match(source, /'Kimi Code account'/);
    assert.match(source, /'managed:kimi-code'/);
    assert.match(source, /'KIMI_CODE_PROVIDER_NAME'/);
    assert.match(source, /'kimi-code-global'/);
    assert.match(source, /'__KIMI_CODE_VERSION__'/);
    assert.match(source, /'kimi-code-linux-x64\.tar\.gz'/);
    assert.match(source, /'@moonshot-ai\/kimi-code'/);
    assert.match(source, /'moonshot-ai\.kimi-code'/);
    assert.match(source, /'https:\/\/code\.kimi\.com\/kimi-code'/);
    assert.match(source, /'kimi-for-coding'/);
    assert.match(source, /'logs\/kimi-code\.log'/);
    assert.match(source, /'\[kimi exec-server\] line'/);

    assert.match(read(root, 'CHANGELOG.md'), /Kimi Code CLI now runs `kimi upgrade`/);
    assert.match(read(root, 'package.json'), /"description": "Kimi Code server"/);
    assert.match(read(root, 'test/sample.test.ts'), /'Kimi Code CLI'/);
    assert.match(read(root, '.github/workflows/ci.yml'), /"Kimi Code CLI"/);
  });
});

await test('apply skips explicitly passed excluded roots', () => {
  withFixture('apply-tree', (root) => {
    const before = read(root, '.github/workflows/ci.yml');
    const result = applyPaths({ root, paths: ['.github'] });
    assert.equal(result.changed.length, 0);
    assert.equal(read(root, '.github/workflows/ci.yml'), before);
  });
});

await test('apply is idempotent', () => {
  withFixture('apply-tree', (root) => {
    applyPaths({ root, paths: ['.'] });
    const second = applyPaths({ root, paths: ['.'] });
    assert.equal(second.changed.length, 0);
    assert.equal(second.totalReplacements, 0);
  });
});

await test('apply leaves over-renamed forms alone and check rejects them', () => {
  withFixture('apply-tree', (root) => {
    applyPaths({ root, paths: ['.'] });
    const clean = checkPaths({ root, paths: ['product.ts'] });
    assert.deepEqual(clean.violations, []);
  });
});

await test('apply rewrites history, manifests, and tests only when asked', () => {
  withFixture('apply-tree', (root) => {
    applyPaths({
      root,
      paths: ['.'],
      includeHistory: true,
      includeManifests: true,
      includeTests: true,
    });

    assert.match(read(root, 'CHANGELOG.md'), /Kiko CLI now runs `kiko upgrade`/);

    const manifest = JSON.parse(read(root, 'package.json'));
    assert.equal(manifest.name, '@moonshot-ai/kimi-code');
    assert.equal(manifest.description, 'Kiko server');
    assert.deepEqual(manifest.bin, { kimi: 'dist/main.mjs' });

    assert.match(read(root, 'test/sample.test.ts'), /'Kiko CLI'/);
    assert.match(read(root, 'test/sample.test.ts'), /run `kiko web`/);
    assert.match(read(root, 'packages/example/README.md'), /The TypeScript SDK for Kimi Code/);
    assert.match(
      read(root, 'packages/example/README.md'),
      /\[Kimi Code\]\(https:\/\/github\.com\/MoonshotAI\/kimi-code\)/,
    );
  });
});

await test('check passes on clean product copy', () => {
  withFixture('clean-tree', (root) => {
    const report = checkPaths({ root, paths: ['.'] });
    assert.equal(report.ok, true);
    assert.deepEqual(report.violations, []);
    assert.equal(report.scannedFiles, 4);
  });
});

await test('telemetry-token ignores repository URLs and quoted repository names', () => {
  withFixture('clean-tree', (root) => {
    const report = checkPaths({ root, paths: ['src/app.ts'] });
    assert.deepEqual(report.violations, []);
  });
});

await test('check reports product, command, and platform-identity violations', () => {
  withFixture('violations-tree', (root) => {
    const report = checkPaths({ root, paths: ['.'] });
    assert.equal(report.ok, false);

    const summary = report.violations.map(
      (violation) => `${violation.file}:${violation.line}:${violation.rule}`,
    );
    assert.deepEqual(summary, [
      '.github/workflows/ci.yml:9:artifact-name',
      'CHANGELOG.md:4:build-define',
      'docs/guide.md:3:kimi-code',
      'docs/guide.md:7:kimi-code',
      'packages/example/package.json:3:kimi-code',
      'packages/example/README.md:3:kimi-code',
      'src/app.ts:1:kimi-code',
      'src/app.ts:3:backticked-command',
      'src/app.ts:5:backticked-command',
      'src/app.ts:7:provider-key',
      'src/app.ts:9:platform-oauth',
      'src/app.ts:11:platform-env',
      'src/app.ts:13:vscode-contribution-id',
      'src/app.ts:15:telemetry-token',
      'src/app.ts:17:kimi-code',
      'src/app.ts:19:kimi-code',
      'src/app.ts:21:telemetry-token',
      'src/app.ts:23:telemetry-token',
    ]);

    assert.ok(
      report.violations.some(
        (violation) =>
          violation.file === 'src/app.ts' &&
          violation.line === 13 &&
          violation.rule === 'vscode-contribution-id',
      ),
      'VS Code context keys must reject the Kiko form',
    );
    assert.ok(
      report.violations.some(
        (violation) =>
          violation.file === 'src/app.ts' &&
          violation.line === 15 &&
          violation.rule === 'telemetry-token',
      ),
      'the kiko-cli telemetry token must be rejected',
    );
    assert.ok(
      report.violations.some(
        (violation) =>
          violation.file === 'src/app.ts' &&
          violation.line === 21 &&
          violation.rule === 'telemetry-token',
      ),
      'an appName telemetry token must be rejected',
    );
    assert.ok(
      report.violations.some(
        (violation) =>
          violation.file === 'src/app.ts' &&
          violation.line === 23 &&
          violation.rule === 'telemetry-token',
      ),
      'a User-Agent token must be rejected',
    );
    assert.ok(
      report.violations.some(
        (violation) =>
          violation.file === 'packages/example/package.json' && violation.kind === 'product-brand',
      ),
      'manifest copy must be classified',
    );

    assert.equal(report.suppressed.length, 1);
    assert.equal(report.suppressed[0].file, 'SECURITY.md');
    assert.equal(report.suppressed[0].text, '`kimi --version`');
    assert.equal(report.suppressed[0].finding, KNOWN_RESIDUALS[0].finding);

    assert.ok(
      report.violations.some(
        (violation) =>
          violation.file === '.github/workflows/ci.yml' &&
          violation.rule === 'artifact-name',
      ),
      'workflow identity surfaces must be scanned',
    );
  });
});

await test('check exempts history product copy but still rejects identity corruption', () => {
  withFixture('violations-tree', (root) => {
    const report = checkPaths({ root, paths: ['.'] });
    const history = report.violations.filter((violation) => violation.file === 'CHANGELOG.md');

    assert.deepEqual(
      history.map((violation) => violation.kind),
      ['platform-identity'],
    );
    assert.equal(history[0].rule, 'build-define');
    assert.equal(
      report.violations.some(
        (violation) =>
          violation.file === 'SECURITY.md' &&
          (violation.kind === 'product-brand' || violation.kind === 'legacy-command'),
      ),
      false,
    );
  });
});

await test('check is read-only', () => {
  withFixture('violations-tree', (root) => {
    const before = snapshot(root);
    checkPaths({ root, paths: ['.'] });
    assert.deepEqual(snapshot(root), before);
  });
});

await test('check CLI reports JSON and the expected exit code', () => {
  const clean = withFixture('clean-tree', (root) =>
    spawnSync(process.execPath, [CHECK_CLI, '--root', root, '--json', '.'], {
      encoding: 'utf8',
    }),
  );
  assert.equal(clean.status, 0, clean.stderr);
  const cleanReport = JSON.parse(clean.stdout);
  assert.equal(cleanReport.ok, true);
  assert.deepEqual(cleanReport.violations, []);

  const dirty = withFixture('violations-tree', (root) =>
    spawnSync(process.execPath, [CHECK_CLI, '--root', root, '--json', '.'], {
      encoding: 'utf8',
    }),
  );
  assert.equal(dirty.status, 1);
  const dirtyReport = JSON.parse(dirty.stdout);
  assert.equal(dirtyReport.ok, false);
  assert.ok(dirtyReport.violations.length > 0);
});

await test('maskComments keeps strings and removes comments', () => {
  const source = [
    "const url = 'https://example.test/Kimi Code';",
    '// Kimi Code in a line comment',
    '/* Kimi Code in a block comment */',
    "const copy = 'Kimi Code';",
  ].join('\n');
  const masked = maskComments(source, '.ts');

  assert.match(masked, /https:\/\/example\.test\/Kimi Code/);
  assert.doesNotMatch(masked, /\/\/ Kimi Code in a line comment/);
  assert.doesNotMatch(masked, /\/\* Kimi Code in a block comment \*\//);
  assert.match(masked, /const copy = 'Kimi Code';/);
});

await test('mapping tables have unique ids', () => {
  for (const table of [
    PRODUCT_PHRASES,
    LEGACY_COMMAND_PATTERNS,
    PLATFORM_CONTEXT_ALLOWLIST,
    OVER_RENAME_RULES,
    PLATFORM_IDENTITIES,
    KNOWN_RESIDUALS,
  ]) {
    const ids = table.map((entry) => entry.id);
    assert.equal(new Set(ids).size, ids.length, ids.join(', '));
  }
  for (const rule of OVER_RENAME_RULES) {
    if (rule.context !== undefined) assert.equal(rule.context.global, false, rule.id);
  }
});

await test('platform identity table covers the mission allowlist', () => {
  const values = new Set(PLATFORM_IDENTITIES.map((entry) => entry.value));
  for (const value of [
    'KIMI_CODE_PROVIDER_NAME',
    'managed:kimi-code',
    'oauth/kimi-code',
    'oauth/kimi-code-env-<suffix>',
    '__KIMI_CODE_<NAME>',
    'kimi-code-global',
    'moonshot-ai.kimi-code',
    '@moonshot-ai/kimi-code',
    'kimi-code-<target>',
    'logs/kimi-code.log',
    'kimi-code-cli',
    'kimi_code_cli',
    'kimi-code.bearer.',
    'kimi-for-coding',
    'https://code.kimi.com/kimi-code',
    'MoonshotAI/kimi-code',
    '.migrated-to-kimi-code',
  ]) {
    assert.ok(values.has(value), value);
  }
});