import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ensureKimiHome, resolveConfigPath, resolveKimiHome } from '#/app/bootstrap/bootstrap';
import {
  KIKO_HOME_MIGRATION_MARKER_FILE,
  migrateKimiCodeHome,
} from '#/app/bootstrap/homeMigration';

const fixtures: string[] = [];

function fixtureHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kiko-home-'));
  fixtures.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function seedLegacyHome(fixture: string): string {
  const legacy = join(fixture, '.kimi-code');
  mkdirSync(join(legacy, 'credentials'), { recursive: true });
  mkdirSync(join(legacy, 'sessions', 'project-1'), { recursive: true });
  mkdirSync(join(legacy, 'plugins', 'example'), { recursive: true });
  mkdirSync(join(legacy, 'logs'), { recursive: true });
  writeFileSync(join(legacy, 'config.toml'), 'default_model = "kimi/kimi-for-coding"\n');
  writeFileSync(join(legacy, 'credentials', 'kimi-code.json'), '{"token":"secret"}\n', {
    mode: 0o600,
  });
  writeFileSync(join(legacy, 'sessions', 'project-1', 'session.jsonl'), '{"type":"user"}\n');
  writeFileSync(join(legacy, 'plugins', 'example', 'plugin.json'), '{"name":"example"}\n');
  writeFileSync(join(legacy, 'logs', 'kimi-code.log'), 'started\n');
  return legacy;
}

function withoutVitest<T>(run: () => T): T {
  const previous = process.env['VITEST'];
  delete process.env['VITEST'];
  try {
    return run();
  } finally {
    if (previous !== undefined) process.env['VITEST'] = previous;
  }
}

describe('bootstrap path helpers', () => {
  describe('resolveKimiHome', () => {
    it('uses explicit homeDir when provided', () => {
      expect(resolveKimiHome('/tmp/kimi')).toBe('/tmp/kimi');
    });

    it('prefers KIKO_HOME over the legacy KIMI_CODE_HOME', () => {
      expect(
        resolveKimiHome(undefined, { KIKO_HOME: '/kiko', KIMI_CODE_HOME: '/legacy-kimi' }),
      ).toBe('/kiko');
    });

    it('still recognizes the legacy KIMI_CODE_HOME', () => {
      const prev = process.env['KIMI_CODE_HOME'];
      process.env['KIMI_CODE_HOME'] = '/env/kimi';
      try {
        expect(resolveKimiHome()).toBe('/env/kimi');
      } finally {
        if (prev === undefined) delete process.env['KIMI_CODE_HOME'];
        else process.env['KIMI_CODE_HOME'] = prev;
      }
    });

    it('defaults a fresh home to ~/.kiko', () => {
      const fixture = fixtureHome();
      expect(resolveKimiHome(undefined, {}, fixture)).toBe(join(fixture, '.kiko'));
      expect(existsSync(join(fixture, '.kiko'))).toBe(false);
    });

    it('keeps using the legacy home while automatic migration is suppressed', () => {
      const fixture = fixtureHome();
      const legacy = seedLegacyHome(fixture);
      expect(resolveKimiHome(undefined, {}, fixture)).toBe(legacy);
      expect(existsSync(join(fixture, '.kiko'))).toBe(false);
    });

    it('migrates a legacy ~/.kimi-code home into ~/.kiko on first resolution', () => {
      const fixture = fixtureHome();
      seedLegacyHome(fixture);
      const home = withoutVitest(() => resolveKimiHome(undefined, {}, fixture));
      expect(home).toBe(join(fixture, '.kiko'));
      expect(readFileSync(join(home, 'config.toml'), 'utf-8')).toContain('kimi/kimi-for-coding');
    });

    it('does not migrate a home addressed by an explicit KIKO_HOME', () => {
      const fixture = fixtureHome();
      const legacy = seedLegacyHome(fixture);
      const explicit = join(fixture, 'explicit');
      expect(withoutVitest(() => resolveKimiHome(undefined, { KIKO_HOME: explicit }, fixture))).toBe(
        explicit,
      );
      expect(existsSync(join(fixture, '.kiko'))).toBe(false);
      expect(existsSync(legacy)).toBe(true);
    });

    it('honors KIKO_HOME_MIGRATION=off', () => {
      const fixture = fixtureHome();
      seedLegacyHome(fixture);
      expect(
        withoutVitest(() =>
          resolveKimiHome(undefined, { KIKO_HOME_MIGRATION: 'off' }, fixture),
        ),
      ).toBe(join(fixture, '.kimi-code'));
      expect(existsSync(join(fixture, '.kiko'))).toBe(false);
    });
  });

  describe('resolveConfigPath', () => {
    it('uses explicit configPath when provided', () => {
      expect(resolveConfigPath({ configPath: '/x/config.toml' })).toBe('/x/config.toml');
    });

    it('joins homeDir with config.toml', () => {
      expect(resolveConfigPath({ homeDir: '/tmp/kimi' })).toBe('/tmp/kimi/config.toml');
    });
  });

  describe('ensureKimiHome', () => {
    it('creates the directory with 0700 permissions', () => {
      const dir = join(fixtureHome(), 'nested');
      ensureKimiHome(dir);
      expect(existsSync(dir)).toBe(true);
      if (process.platform !== 'win32') {
        expect(statSync(dir).mode & 0o777).toBe(0o700);
      }
    });
  });
});

describe('migrateKimiCodeHome', () => {
  it('copies config, credentials, sessions, plugins and logs without touching the legacy home', () => {
    const fixture = fixtureHome();
    const legacy = seedLegacyHome(fixture);

    const result = migrateKimiCodeHome({ osHomeDir: fixture, env: {} });

    expect(result.outcome).toBe('migrated');
    expect(result.homeDir).toBe(join(fixture, '.kiko'));
    expect(result.canonicalHome).toBe(join(fixture, '.kiko'));
    expect(result.legacyHome).toBe(legacy);
    for (const relative of [
      'config.toml',
      'credentials/kimi-code.json',
      'sessions/project-1/session.jsonl',
      'plugins/example/plugin.json',
      'logs/kimi-code.log',
    ]) {
      expect(readFileSync(join(legacy, relative), 'utf-8')).toBe(
        readFileSync(join(fixture, '.kiko', relative), 'utf-8'),
      );
    }
    if (process.platform !== 'win32') {
      expect(statSync(join(fixture, '.kiko', 'credentials', 'kimi-code.json')).mode & 0o777).toBe(
        0o600,
      );
      expect(statSync(join(fixture, '.kiko')).mode & 0o777).toBe(0o700);
    }
    expect(existsSync(join(fixture, '.kiko', KIKO_HOME_MIGRATION_MARKER_FILE))).toBe(true);
  });

  it('is idempotent and never overwrites a home that already migrated', () => {
    const fixture = fixtureHome();
    seedLegacyHome(fixture);
    expect(migrateKimiCodeHome({ osHomeDir: fixture, env: {} }).outcome).toBe('migrated');

    const canonicalConfig = join(fixture, '.kiko', 'config.toml');
    writeFileSync(canonicalConfig, 'default_model = "kimi/kimi-k2"\n');

    const again = migrateKimiCodeHome({ osHomeDir: fixture, env: {} });

    expect(again.outcome).toBe('already-migrated');
    expect(again.homeDir).toBe(join(fixture, '.kiko'));
    expect(readFileSync(canonicalConfig, 'utf-8')).toBe('default_model = "kimi/kimi-k2"\n');
  });

  it('reports no-legacy and leaves a fresh canonical home to the caller', () => {
    const fixture = fixtureHome();
    const result = migrateKimiCodeHome({ osHomeDir: fixture, env: {} });
    expect(result.outcome).toBe('no-legacy');
    expect(result.homeDir).toBe(join(fixture, '.kiko'));
    expect(existsSync(join(fixture, '.kiko'))).toBe(false);
  });

  it('fills a pre-created empty ~/.kiko directory', () => {
    const fixture = fixtureHome();
    seedLegacyHome(fixture);
    mkdirSync(join(fixture, '.kiko'));

    const result = migrateKimiCodeHome({ osHomeDir: fixture, env: {} });

    expect(result.outcome).toBe('migrated');
    expect(readFileSync(join(fixture, '.kiko', 'config.toml'), 'utf-8')).toContain(
      'kimi/kimi-for-coding',
    );
  });

  it('never merges into a non-empty ~/.kiko that has no migration marker', () => {
    const fixture = fixtureHome();
    seedLegacyHome(fixture);
    mkdirSync(join(fixture, '.kiko'), { recursive: true });
    writeFileSync(join(fixture, '.kiko', 'user.toml'), 'mine\n');

    const result = migrateKimiCodeHome({ osHomeDir: fixture, env: {} });

    expect(result.outcome).toBe('canonical-exists');
    expect(result.homeDir).toBe(join(fixture, '.kiko'));
    expect(readFileSync(join(fixture, '.kiko', 'user.toml'), 'utf-8')).toBe('mine\n');
    expect(existsSync(join(fixture, '.kiko', 'config.toml'))).toBe(false);
  });

  it('throws an actionable error instead of falling back to the legacy home when the lock is held', () => {
    const fixture = fixtureHome();
    const legacy = seedLegacyHome(fixture);
    writeFileSync(
      join(fixture, '.kiko-migration.lock'),
      JSON.stringify({ pid: process.pid, token: 'held', startedAt: Date.now() }),
    );

    expect(() =>
      migrateKimiCodeHome({ osHomeDir: fixture, env: {}, lockTimeoutMs: 20 }),
    ).toThrow(/another kiko process is migrating/);
    expect(existsSync(join(fixture, '.kiko'))).toBe(false);
    expect(existsSync(join(legacy, 'config.toml'))).toBe(true);
  });

  it('does not steal a live lock just because it is older than the stale age', () => {
    const fixture = fixtureHome();
    seedLegacyHome(fixture);
    const lockPath = join(fixture, '.kiko-migration.lock');
    writeFileSync(
      lockPath,
      JSON.stringify({
        pid: process.pid,
        token: 'slow-live-holder',
        startedAt: Date.now() - 11 * 60_000,
      }),
    );

    expect(() =>
      migrateKimiCodeHome({ osHomeDir: fixture, env: {}, lockTimeoutMs: 20 }),
    ).toThrow(/another kiko process is migrating/);
    expect(existsSync(lockPath)).toBe(true);
    expect(existsSync(join(fixture, '.kiko'))).toBe(false);
  });

  it('reclaims a stale lock whose holder pid is gone', () => {
    const fixture = fixtureHome();
    seedLegacyHome(fixture);
    const lockPath = join(fixture, '.kiko-migration.lock');
    writeFileSync(
      lockPath,
      JSON.stringify({
        pid: 2_147_483_647,
        token: 'dead-holder',
        startedAt: Date.now() - 11 * 60_000,
      }),
    );

    const result = migrateKimiCodeHome({ osHomeDir: fixture, env: {}, lockTimeoutMs: 200 });

    expect(result.outcome).toBe('migrated');
    expect(existsSync(lockPath)).toBe(false);
  });

  it('does not cache lock contention; after the holder completes, resolution uses canonical', () => {
    const fixture = fixtureHome();
    seedLegacyHome(fixture);
    const lockPath = join(fixture, '.kiko-migration.lock');
    writeFileSync(
      lockPath,
      JSON.stringify({ pid: process.pid, token: 'holder', startedAt: Date.now() }),
    );

    expect(() =>
      withoutVitest(() =>
        resolveKimiHome(undefined, {}, fixture, { migrationLockTimeoutMs: 20 }),
      ),
    ).toThrow(/another kiko process is migrating/);
    expect(existsSync(join(fixture, '.kiko'))).toBe(false);

    rmSync(lockPath);
    expect(migrateKimiCodeHome({ osHomeDir: fixture, env: {} }).outcome).toBe('migrated');

    expect(withoutVitest(() => resolveKimiHome(undefined, {}, fixture))).toBe(
      join(fixture, '.kiko'),
    );
  });

  it('waits for a migration held by another process and resolves canonical afterwards', async () => {
    const fixture = fixtureHome();
    seedLegacyHome(fixture);
    const modulePath = fileURLToPath(
      new URL('../../../src/app/bootstrap/homeMigration.ts', import.meta.url),
    );
    const scriptPath = join(fixture, 'holder.mts');
    writeFileSync(
      scriptPath,
      [
        `import { rmSync, writeFileSync } from 'node:fs';`,
        `import { join } from 'node:path';`,
        `import { migrateKimiCodeHome } from ${JSON.stringify(modulePath)};`,
        `const fixture = process.argv[2];`,
        `const lockPath = join(fixture, '.kiko-migration.lock');`,
        `writeFileSync(lockPath, JSON.stringify({ pid: process.pid, token: 'child-holder', startedAt: Date.now() }));`,
        `process.stdout.write('locked\\n');`,
        `await new Promise((resolve) => setTimeout(resolve, Number(process.argv[3])));`,
        `rmSync(lockPath, { force: true });`,
        `const result = migrateKimiCodeHome({ osHomeDir: fixture, env: {} });`,
        `process.stdout.write('done:' + result.outcome + '\\n');`,
      ].join('\n'),
    );
    const child = spawn(process.execPath, ['--import', 'tsx', scriptPath, fixture, '500'], {
      cwd: fileURLToPath(new URL('../../..', import.meta.url)),
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    try {
      await new Promise<void>((resolve, reject) => {
        let buffered = '';
        child.stdout.setEncoding('utf-8');
        child.stdout.on('data', (chunk: string) => {
          buffered += chunk;
          if (buffered.includes('locked')) resolve();
        });
        child.on('error', reject);
        child.on('exit', (code) => {
          if (!buffered.includes('locked')) {
            reject(new Error(`holder exited early (${String(code)}): ${buffered}`));
          }
        });
      });

      const home = withoutVitest(() =>
        resolveKimiHome(undefined, {}, fixture, { migrationLockTimeoutMs: 10_000 }),
      );

      expect(home).toBe(join(fixture, '.kiko'));
      expect(readFileSync(join(fixture, '.kiko', 'config.toml'), 'utf-8')).toContain(
        'kimi/kimi-for-coding',
      );
      await once(child, 'exit');
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
  });

  it('does not cache a failed migration; a later resolve uses the completed migration', () => {
    if (process.getuid?.() === 0) return;
    const fixture = fixtureHome();
    seedLegacyHome(fixture);
    chmodSync(fixture, 0o500);
    let first: string;
    try {
      first = withoutVitest(() => resolveKimiHome(undefined, {}, fixture));
    } finally {
      chmodSync(fixture, 0o700);
    }
    expect(first).toBe(join(fixture, '.kimi-code'));

    expect(migrateKimiCodeHome({ osHomeDir: fixture, env: {} }).outcome).toBe('migrated');
    expect(withoutVitest(() => resolveKimiHome(undefined, {}, fixture))).toBe(
      join(fixture, '.kiko'),
    );
  });

  it('fills a symlinked empty ~/.kiko instead of failing on the symlink', () => {
    const fixture = fixtureHome();
    seedLegacyHome(fixture);
    const target = join(fixture, 'kiko-target');
    mkdirSync(target);
    symlinkSync(target, join(fixture, '.kiko'), 'dir');

    const result = migrateKimiCodeHome({ osHomeDir: fixture, env: {} });

    expect(result.outcome).toBe('migrated');
    expect(lstatSync(join(fixture, '.kiko')).isSymbolicLink()).toBe(true);
    expect(existsSync(join(target, 'config.toml'))).toBe(true);
  });

  it('migrates into a pre-created empty ~/.kiko on resolution', () => {
    const fixture = fixtureHome();
    seedLegacyHome(fixture);
    mkdirSync(join(fixture, '.kiko'));

    expect(withoutVitest(() => resolveKimiHome(undefined, {}, fixture))).toBe(
      join(fixture, '.kiko'),
    );
    expect(readFileSync(join(fixture, '.kiko', 'config.toml'), 'utf-8')).toContain(
      'kimi/kimi-for-coding',
    );
  });

  it('reports actionable recovery guidance for a non-empty canonical without a marker', () => {
    const fixture = fixtureHome();
    seedLegacyHome(fixture);
    mkdirSync(join(fixture, '.kiko'), { recursive: true });
    writeFileSync(join(fixture, '.kiko', 'user.toml'), 'mine\n');
    const writes: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    try {
      withoutVitest(() => migrateKimiCodeHome({ osHomeDir: fixture, env: {} }));
    } finally {
      spy.mockRestore();
    }
    const output = writes.join('');
    expect(output).toContain('no .kiko-migration.json');
    expect(output).toContain('KIKO_HOME=');
  });

  it('reports a failed migration once with the reason', () => {
    if (process.getuid?.() === 0) return;
    const fixture = fixtureHome();
    seedLegacyHome(fixture);
    chmodSync(fixture, 0o500);
    const writes: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    try {
      withoutVitest(() =>
        migrateKimiCodeHome({ osHomeDir: fixture, env: {}, lockTimeoutMs: 20 }),
      );
    } finally {
      spy.mockRestore();
      chmodSync(fixture, 0o700);
    }
    const output = writes.join('');
    expect(output).toContain('could not migrate');
    expect(output).toContain('continuing with');
  });

  it('rolls back to the legacy home when copying fails', () => {
    if (process.getuid?.() === 0) return;
    const fixture = fixtureHome();
    const legacy = seedLegacyHome(fixture);
    chmodSync(fixture, 0o500);
    try {
      const result = migrateKimiCodeHome({ osHomeDir: fixture, env: {}, lockTimeoutMs: 20 });
      expect(result.outcome).toBe('failed');
      expect(result.homeDir).toBe(legacy);
      expect(existsSync(join(fixture, '.kiko'))).toBe(false);
    } finally {
      chmodSync(fixture, 0o700);
    }
  });

  it('does nothing when an explicit home env is set', () => {
    const fixture = fixtureHome();
    seedLegacyHome(fixture);
    const result = migrateKimiCodeHome({
      osHomeDir: fixture,
      env: { KIKO_HOME: '/explicit/kiko' },
    });
    expect(result.outcome).toBe('disabled');
    expect(result.homeDir).toBe('/explicit/kiko');
    expect(existsSync(join(fixture, '.kiko'))).toBe(false);
  });
});