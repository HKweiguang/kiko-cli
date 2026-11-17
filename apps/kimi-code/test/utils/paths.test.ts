import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getBinDir,
  getDataDir,
  getInputHistoryFile,
  getLogDir,
  getUpdateInstallStateFile,
  getUpdateStateFile,
} from '#/utils/paths';

const originalEnv = { ...process.env };
const fixtures: string[] = [];

function fixtureHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kiko-app-home-'));
  fixtures.push(dir);
  return dir;
}

function seedLegacyHome(fixture: string): string {
  const legacy = join(fixture, '.kimi-code');
  mkdirSync(join(legacy, 'sessions'), { recursive: true });
  writeFileSync(join(legacy, 'config.toml'), 'default_model = "kimi/kimi-for-coding"\n');
  writeFileSync(join(legacy, 'sessions', 'session.jsonl'), '{"type":"user"}\n');
  return legacy;
}

beforeEach(() => {
  for (const key of ['KIKO_HOME', 'KIMI_CODE_HOME', 'KIKO_HOME_MIGRATION']) {
    delete process.env[key];
  }
});

afterEach(() => {
  process.env = { ...originalEnv };
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('getDataDir', () => {
  it('returns ~/.kiko on a fresh home', () => {
    const fixture = fixtureHome();
    expect(getDataDir({}, fixture)).toBe(join(fixture, '.kiko'));
  });

  it('prefers KIKO_HOME and ignores the legacy KIMI_CODE_HOME', () => {
    expect(
      getDataDir({ KIKO_HOME: '/tmp/kiko-home', KIMI_CODE_HOME: '/tmp/kimi-legacy' }, '/home/user'),
    ).toBe('/tmp/kiko-home');
  });

  it('ignores KIMI_CODE_HOME', () => {
    expect(getDataDir({ KIMI_CODE_HOME: '/tmp/kimi-test-data' }, '/home/user')).toBe(
      join('/home/user', '.kiko'),
    );
  });

  it('returns KIKO_HOME even if it is a relative path', () => {
    expect(getDataDir({ KIKO_HOME: 'relative/path' }, '/home/user')).toBe('relative/path');
  });

  it('does not read, create, migrate, or delete a legacy ~/.kimi-code home', () => {
    const fixture = fixtureHome();
    const legacy = seedLegacyHome(fixture);
    const writes: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    try {
      expect(getDataDir({}, fixture)).toBe(join(fixture, '.kiko'));
    } finally {
      spy.mockRestore();
    }

    expect(writes.join('')).toBe('');
    expect(existsSync(join(fixture, '.kiko'))).toBe(false);
    expect(existsSync(join(fixture, '.kiko-migration.json'))).toBe(false);
    expect(existsSync(join(fixture, '.kiko-migration.lock'))).toBe(false);
    expect(readFileSync(join(legacy, 'config.toml'), 'utf-8')).toContain('kimi-for-coding');
    expect(readFileSync(join(legacy, 'sessions', 'session.jsonl'), 'utf-8')).toContain('user');
  });

  it('ignores KIKO_HOME_MIGRATION and never turns ~/.kimi-code into the data dir', () => {
    const fixture = fixtureHome();
    const legacy = seedLegacyHome(fixture);

    expect(getDataDir({ KIKO_HOME_MIGRATION: 'off' }, fixture)).toBe(join(fixture, '.kiko'));
    expect(getDataDir({ KIKO_HOME_MIGRATION: 'on' }, fixture)).toBe(join(fixture, '.kiko'));
    expect(existsSync(join(fixture, '.kiko'))).toBe(false);
    expect(existsSync(legacy)).toBe(true);
  });
});

describe('getLogDir', () => {
  it('returns <dataDir>/logs', () => {
    process.env['KIKO_HOME'] = '/z';
    expect(getLogDir()).toBe(join('/z', 'logs'));
  });

  it('ignores the legacy KIMI_CODE_HOME', () => {
    process.env['KIMI_CODE_HOME'] = '/legacy-z';
    expect(getLogDir()).toBe(join(homedir(), '.kiko', 'logs'));
  });
});

describe('getBinDir', () => {
  it('returns <dataDir>/bin', () => {
    process.env['KIKO_HOME'] = '/custom-bin-home';
    expect(getBinDir()).toBe(join('/custom-bin-home', 'bin'));
  });
});

describe('getUpdateStateFile', () => {
  it('returns <dataDir>/updates/latest.json', () => {
    process.env['KIKO_HOME'] = '/updates-home';
    expect(getUpdateStateFile()).toBe(join('/updates-home', 'updates', 'latest.json'));
  });
});

describe('getUpdateInstallStateFile', () => {
  it('returns <dataDir>/updates/install.json', () => {
    process.env['KIKO_HOME'] = '/updates-home';
    expect(getUpdateInstallStateFile()).toBe(join('/updates-home', 'updates', 'install.json'));
  });
});

describe('getInputHistoryFile', () => {
  it('returns <dataDir>/user-history/<md5(workDir)>.jsonl', () => {
    const workDir = '/home/user/project';
    const hash = createHash('md5').update(workDir, 'utf-8').digest('hex');
    process.env['KIKO_HOME'] = '/custom/data';
    expect(getInputHistoryFile(workDir)).toBe(
      join('/custom/data', 'user-history', `${hash}.jsonl`),
    );
  });
});