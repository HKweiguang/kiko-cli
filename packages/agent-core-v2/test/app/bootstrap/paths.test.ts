import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

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

  it('falls back to the legacy home when the migration lock is held', () => {
    const fixture = fixtureHome();
    const legacy = seedLegacyHome(fixture);
    writeFileSync(
      join(fixture, '.kiko-migration.lock'),
      JSON.stringify({ pid: process.pid, startedAt: Date.now() }),
    );

    const result = migrateKimiCodeHome({ osHomeDir: fixture, env: {}, lockTimeoutMs: 20 });

    expect(result.outcome).toBe('locked');
    expect(result.homeDir).toBe(legacy);
    expect(existsSync(join(fixture, '.kiko'))).toBe(false);
    expect(existsSync(join(legacy, 'config.toml'))).toBe(true);
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