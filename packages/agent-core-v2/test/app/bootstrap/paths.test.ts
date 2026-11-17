import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ensureKimiHome, resolveConfigPath, resolveKimiHome } from '#/app/bootstrap/bootstrap';

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
  writeFileSync(join(legacy, 'config.toml'), 'default_model = "kimi/kimi-for-coding"\n');
  writeFileSync(join(legacy, 'credentials', 'kimi-code.json'), '{"token":"secret"}\n', {
    mode: 0o600,
  });
  writeFileSync(join(legacy, 'sessions', 'project-1', 'session.jsonl'), '{"type":"user"}\n');
  return legacy;
}

function expectLegacyHomePreserved(fixture: string, legacy: string): void {
  expect(existsSync(join(legacy, 'config.toml'))).toBe(true);
  expect(readFileSync(join(legacy, 'config.toml'), 'utf-8')).toContain('kimi/kimi-for-coding');
  expect(existsSync(join(legacy, 'credentials', 'kimi-code.json'))).toBe(true);
  expect(existsSync(join(legacy, 'sessions', 'project-1', 'session.jsonl'))).toBe(true);
  expect(existsSync(join(fixture, '.kiko-migration.json'))).toBe(false);
  expect(existsSync(join(fixture, '.kiko-migration.lock'))).toBe(false);
}

describe('bootstrap path helpers', () => {
  describe('resolveKimiHome', () => {
    it('uses explicit homeDir when provided', () => {
      expect(resolveKimiHome('/tmp/kimi')).toBe('/tmp/kimi');
    });

    it('uses KIKO_HOME when no explicit home is given', () => {
      expect(resolveKimiHome(undefined, { KIKO_HOME: '/kiko' })).toBe('/kiko');
    });

    it('returns KIKO_HOME without resolving it even when relative', () => {
      expect(resolveKimiHome(undefined, { KIKO_HOME: 'relative/path' }, '/os-home')).toBe(
        'relative/path',
      );
    });

    it('ignores the legacy KIMI_CODE_HOME', () => {
      const fixture = fixtureHome();
      expect(resolveKimiHome(undefined, { KIMI_CODE_HOME: '/legacy-kimi' }, fixture)).toBe(
        join(fixture, '.kiko'),
      );
    });

    it('ignores an empty KIKO_HOME', () => {
      const fixture = fixtureHome();
      expect(resolveKimiHome(undefined, { KIKO_HOME: '' }, fixture)).toBe(join(fixture, '.kiko'));
    });

    it('defaults a fresh home to ~/.kiko without creating it', () => {
      const fixture = fixtureHome();
      expect(resolveKimiHome(undefined, {}, fixture)).toBe(join(fixture, '.kiko'));
      expect(existsSync(join(fixture, '.kiko'))).toBe(false);
    });

    it('ignores an existing ~/.kimi-code home instead of reading or migrating it', () => {
      const fixture = fixtureHome();
      const legacy = seedLegacyHome(fixture);

      expect(resolveKimiHome(undefined, {}, fixture)).toBe(join(fixture, '.kiko'));
      expect(existsSync(join(fixture, '.kiko'))).toBe(false);
      expectLegacyHomePreserved(fixture, legacy);
    });

    it('keeps ignoring ~/.kimi-code when KIKO_HOME_MIGRATION is not off', () => {
      const fixture = fixtureHome();
      const legacy = seedLegacyHome(fixture);

      expect(resolveKimiHome(undefined, { KIKO_HOME_MIGRATION: 'off' }, fixture)).toBe(
        join(fixture, '.kiko'),
      );
      expect(resolveKimiHome(undefined, { KIKO_HOME_MIGRATION: 'on' }, fixture)).toBe(
        join(fixture, '.kiko'),
      );
      expectLegacyHomePreserved(fixture, legacy);
    });

    it('uses a populated ~/.kiko and leaves ~/.kimi-code alone', () => {
      const fixture = fixtureHome();
      const legacy = seedLegacyHome(fixture);
      mkdirSync(join(fixture, '.kiko'));
      writeFileSync(join(fixture, '.kiko', 'config.toml'), 'canonical\n');

      expect(resolveKimiHome(undefined, {}, fixture)).toBe(join(fixture, '.kiko'));
      expect(readFileSync(join(fixture, '.kiko', 'config.toml'), 'utf-8')).toBe('canonical\n');
      expectLegacyHomePreserved(fixture, legacy);
    });

    it('does not treat a legacy home with only an empty ~/.kiko as usable', () => {
      const fixture = fixtureHome();
      const legacy = seedLegacyHome(fixture);
      mkdirSync(join(fixture, '.kiko'));

      expect(resolveKimiHome(undefined, {}, fixture)).toBe(join(fixture, '.kiko'));
      expectLegacyHomePreserved(fixture, legacy);
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