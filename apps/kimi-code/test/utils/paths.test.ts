import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
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

function withoutVitest<T>(run: () => T): T {
  const previous = process.env['VITEST'];
  delete process.env['VITEST'];
  try {
    return run();
  } finally {
    if (previous !== undefined) process.env['VITEST'] = previous;
  }
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

  it('prefers KIKO_HOME over the legacy KIMI_CODE_HOME', () => {
    expect(
      getDataDir({ KIKO_HOME: '/tmp/kiko-home', KIMI_CODE_HOME: '/tmp/kimi-legacy' }, '/home/user'),
    ).toBe('/tmp/kiko-home');
  });

  it('keeps recognizing KIMI_CODE_HOME', () => {
    expect(getDataDir({ KIMI_CODE_HOME: '/tmp/kimi-test-data' }, '/home/user')).toBe(
      '/tmp/kimi-test-data',
    );
  });

  it('returns KIKO_HOME even if it is a relative path', () => {
    expect(getDataDir({ KIKO_HOME: 'relative/path' }, '/home/user')).toBe('relative/path');
  });

  it('migrates an existing ~/.kimi-code home instead of ignoring it', () => {
    const fixture = fixtureHome();
    const legacy = join(fixture, '.kimi-code');
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, 'config.toml'), 'default_model = "kimi/kimi-for-coding"\n');

    const home = withoutVitest(() => getDataDir({}, fixture));

    expect(home).toBe(join(fixture, '.kiko'));
    expect(readFileSync(join(home, 'config.toml'), 'utf-8')).toContain('kimi-for-coding');
    expect(readFileSync(join(legacy, 'config.toml'), 'utf-8')).toContain('kimi-for-coding');
  });

  it('does not touch a legacy home addressed by KIMI_CODE_HOME', () => {
    const fixture = fixtureHome();
    mkdirSync(join(fixture, '.kimi-code'), { recursive: true });
    withoutVitest(() => {
      expect(getDataDir({ KIMI_CODE_HOME: join(fixture, 'legacy-env') }, fixture)).toBe(
        join(fixture, 'legacy-env'),
      );
    });
    expect(existsSync(join(fixture, '.kiko'))).toBe(false);
  });

  it('re-resolves after a failed migration instead of caching the legacy home', () => {
    if (process.getuid?.() === 0) return;
    const fixture = fixtureHome();
    const legacy = join(fixture, '.kimi-code');
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, 'config.toml'), 'default_model = "kimi/kimi-for-coding"\n');

    chmodSync(fixture, 0o500);
    const writes: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    let first: string;
    try {
      first = withoutVitest(() => getDataDir({}, fixture));
    } finally {
      spy.mockRestore();
      chmodSync(fixture, 0o700);
    }
    expect(first).toBe(legacy);
    expect(writes.join('')).toContain('continuing with');

    renameSync(legacy, join(fixture, '.kiko'));
    expect(withoutVitest(() => getDataDir({}, fixture))).toBe(join(fixture, '.kiko'));
  });
});

describe('getLogDir', () => {
  it('returns <dataDir>/logs', () => {
    process.env['KIKO_HOME'] = '/z';
    expect(getLogDir()).toBe(join('/z', 'logs'));
  });

  it('respects the legacy KIMI_CODE_HOME', () => {
    process.env['KIMI_CODE_HOME'] = '/legacy-z';
    expect(getLogDir()).toBe(join('/legacy-z', 'logs'));
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