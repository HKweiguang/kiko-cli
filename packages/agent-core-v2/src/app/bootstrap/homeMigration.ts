import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  cpSync,
  existsSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { homedir } from 'node:os';

import { join } from 'pathe';

export const KIKO_HOME_ENV = 'KIKO_HOME';
export const LEGACY_KIMI_CODE_HOME_ENV = 'KIMI_CODE_HOME';
export const KIKO_DATA_DIR_NAME = '.kiko';
export const LEGACY_KIMI_CODE_DATA_DIR_NAME = '.kimi-code';
export const KIKO_HOME_MIGRATION_DISABLE_ENV = 'KIKO_HOME_MIGRATION';
export const KIKO_HOME_MIGRATION_MARKER_FILE = '.kiko-migration.json';

const KIKO_HOME_MIGRATION_LOCK_FILE = '.kiko-migration.lock';
const KIKO_HOME_MIGRATION_SCHEMA_VERSION = 1;
const LOCK_POLL_MS = 25;
const DEFAULT_LOCK_TIMEOUT_MS = 60_000;
const STALE_LOCK_AGE_MS = 10 * 60_000;

export type KimiHomeMigrationOutcome =
  | 'migrated'
  | 'already-migrated'
  | 'canonical-exists'
  | 'no-legacy'
  | 'disabled'
  | 'locked'
  | 'failed';

export interface KimiHomeMigrationOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly osHomeDir?: string;
  readonly lockTimeoutMs?: number;
}

export interface KimiHomeMigrationResult {
  readonly outcome: KimiHomeMigrationOutcome;
  readonly homeDir: string;
  readonly canonicalHome: string;
  readonly legacyHome: string;
  readonly error?: unknown;
}

const resolvedDefaults = new Map<string, KimiHomeMigrationResult>();

export function resolveKimiHome(
  homeDir?: string,
  env: NodeJS.ProcessEnv = process.env,
  osHomeDir: string = homedir(),
): string {
  if (homeDir !== undefined) return homeDir;
  const envHome = nonEmpty(env[KIKO_HOME_ENV]) ?? nonEmpty(env[LEGACY_KIMI_CODE_HOME_ENV]);
  if (envHome !== undefined) return envHome;
  return resolveDefaultKimiHome(env, osHomeDir);
}

function resolveDefaultKimiHome(
  env: NodeJS.ProcessEnv = process.env,
  osHomeDir: string = homedir(),
): string {
  const canonical = join(osHomeDir, KIKO_DATA_DIR_NAME);
  const legacy = join(osHomeDir, LEGACY_KIMI_CODE_DATA_DIR_NAME);
  const cached = resolvedDefaults.get(osHomeDir);
  if (cached !== undefined) return cached.homeDir;
  if (isCompletedHome(canonical)) return canonical;
  if (!isDirectory(legacy)) return canonical;
  if (!autoMigrationEnabled(env)) return legacy;
  return migrateKimiCodeHome({ env, osHomeDir }).homeDir;
}

export function migrateKimiCodeHome(
  options: KimiHomeMigrationOptions = {},
): KimiHomeMigrationResult {
  const env = options.env ?? process.env;
  const osHomeDir = options.osHomeDir ?? homedir();
  const canonical = join(osHomeDir, KIKO_DATA_DIR_NAME);
  const legacy = join(osHomeDir, LEGACY_KIMI_CODE_DATA_DIR_NAME);
  const base = { canonicalHome: canonical, legacyHome: legacy };

  const explicitHome = nonEmpty(env[KIKO_HOME_ENV]) ?? nonEmpty(env[LEGACY_KIMI_CODE_HOME_ENV]);
  if (explicitHome !== undefined) {
    return { ...base, outcome: 'disabled', homeDir: explicitHome };
  }

  if (isCompletedHome(canonical)) {
    return remember(osHomeDir, {
      ...base,
      outcome: hasMigrationMarker(canonical) ? 'already-migrated' : 'canonical-exists',
      homeDir: canonical,
    });
  }
  if (!isDirectory(legacy)) {
    return remember(osHomeDir, { ...base, outcome: 'no-legacy', homeDir: canonical });
  }
  if (existsSync(canonical) && !isDirectory(canonical)) {
    return remember(osHomeDir, {
      ...base,
      outcome: 'failed',
      homeDir: legacy,
      error: new Error(`${canonical} exists and is not a directory`),
    });
  }

  return runMigration({
    osHomeDir,
    canonical,
    legacy,
    lockTimeoutMs: options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS,
  });
}

interface RunMigrationInput {
  readonly osHomeDir: string;
  readonly canonical: string;
  readonly legacy: string;
  readonly lockTimeoutMs: number;
}

function runMigration(input: RunMigrationInput): KimiHomeMigrationResult {
  const { osHomeDir, canonical, legacy, lockTimeoutMs } = input;
  const base = { canonicalHome: canonical, legacyHome: legacy };
  const lockPath = join(osHomeDir, KIKO_HOME_MIGRATION_LOCK_FILE);

  let locked: boolean;
  try {
    locked = acquireLock(lockPath, lockTimeoutMs);
  } catch (error: unknown) {
    return remember(osHomeDir, {
      ...base,
      outcome: 'failed',
      homeDir: legacy,
      error,
    });
  }
  if (!locked) {
    if (isCompletedHome(canonical)) {
      return remember(osHomeDir, { ...base, outcome: 'already-migrated', homeDir: canonical });
    }
    return remember(osHomeDir, {
      ...base,
      outcome: 'locked',
      homeDir: isDirectory(legacy) ? legacy : canonical,
    });
  }

  const staging = join(osHomeDir, `${KIKO_DATA_DIR_NAME}-migrating-${process.pid}-${randomUUID()}`);
  try {
    if (isCompletedHome(canonical)) {
      return remember(osHomeDir, { ...base, outcome: 'already-migrated', homeDir: canonical });
    }
    if (!isDirectory(legacy)) {
      return remember(osHomeDir, { ...base, outcome: 'no-legacy', homeDir: canonical });
    }

    try {
      cpSync(legacy, staging, {
        recursive: true,
        dereference: false,
        preserveTimestamps: true,
        verbatimSymlinks: true,
        mode: fsConstants.COPYFILE_FICLONE,
      });
      chmodSync(staging, 0o700);
      assertMirrored(legacy, staging);

      if (existsSync(canonical)) {
        if (!isDirectory(canonical) || readdirSync(canonical).length > 0) {
          return remember(osHomeDir, {
            ...base,
            outcome: 'canonical-exists',
            homeDir: canonical,
          });
        }
        rmdirSync(canonical);
      }
      renameSync(staging, canonical);
      writeMigrationMarker(canonical, legacy);
      return remember(osHomeDir, { ...base, outcome: 'migrated', homeDir: canonical });
    } catch (error: unknown) {
      if (isCompletedHome(canonical)) {
        return remember(osHomeDir, { ...base, outcome: 'already-migrated', homeDir: canonical });
      }
      return remember(osHomeDir, {
        ...base,
        outcome: 'failed',
        homeDir: isDirectory(legacy) ? legacy : canonical,
        error,
      });
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
    releaseLock(lockPath);
  }
}

function autoMigrationEnabled(env: NodeJS.ProcessEnv): boolean {
  if (process.env['VITEST'] !== undefined) return false;
  const value = nonEmpty(env[KIKO_HOME_MIGRATION_DISABLE_ENV])?.toLowerCase();
  return value !== 'off' && value !== '0' && value !== 'false';
}

function nonEmpty(value: string | undefined): string | undefined {
  return value !== undefined && value.length > 0 ? value : undefined;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isCompletedHome(homeDir: string): boolean {
  if (!isDirectory(homeDir)) return false;
  if (hasMigrationMarker(homeDir)) return true;
  try {
    return readdirSync(homeDir).length > 0;
  } catch {
    return false;
  }
}

function hasMigrationMarker(homeDir: string): boolean {
  return existsSync(join(homeDir, KIKO_HOME_MIGRATION_MARKER_FILE));
}

function remember(osHomeDir: string, result: KimiHomeMigrationResult): KimiHomeMigrationResult {
  resolvedDefaults.set(osHomeDir, result);
  return result;
}

function acquireLock(lockPath: string, timeoutMs: number): boolean {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const fd = openSync(lockPath, 'wx', 0o600);
      try {
        writeSync(fd, JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
      } finally {
        closeSync(fd);
      }
      return true;
    } catch (error: unknown) {
      if (!isAlreadyExists(error)) throw error;
    }
    if (isStaleLock(lockPath)) {
      rmSync(lockPath, { force: true });
      continue;
    }
    if (Date.now() >= deadline) return false;
    sleepSync(LOCK_POLL_MS);
  }
}

function releaseLock(lockPath: string): void {
  rmSync(lockPath, { force: true });
}

function isAlreadyExists(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'EEXIST';
}

function isStaleLock(lockPath: string): boolean {
  let raw: string;
  try {
    raw = readFileSync(lockPath, 'utf-8');
  } catch {
    return true;
  }
  let lock: { pid?: unknown; startedAt?: unknown };
  try {
    lock = JSON.parse(raw) as { pid?: unknown; startedAt?: unknown };
  } catch {
    return true;
  }
  const startedAt = typeof lock.startedAt === 'number' ? lock.startedAt : undefined;
  if (startedAt === undefined || Date.now() - startedAt > STALE_LOCK_AGE_MS) return true;
  const pid = typeof lock.pid === 'number' ? lock.pid : undefined;
  if (pid === undefined) return true;
  return !isProcessAlive(pid);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException | undefined)?.code === 'EPERM';
  }
}

const sleepArray = new Int32Array(new SharedArrayBuffer(4));

function sleepSync(ms: number): void {
  Atomics.wait(sleepArray, 0, 0, ms);
}

function assertMirrored(source: string, target: string): void {
  const expected = snapshotTree(source);
  const actual = snapshotTree(target);
  if (expected.size !== actual.size) {
    throw new Error(
      `migration verification failed: ${expected.size} source entries but ${actual.size} copied`,
    );
  }
  for (const [relative, signature] of expected) {
    if (actual.get(relative) !== signature) {
      throw new Error(`migration verification failed for ${relative}`);
    }
  }
}

function snapshotTree(root: string, relative = '', out = new Map<string, string>()): Map<string, string> {
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    const childRelative = relative === '' ? entry.name : `${relative}/${entry.name}`;
    const childPath = join(root, childRelative);
    if (entry.isSymbolicLink()) {
      out.set(childRelative, `link:${readlinkSync(childPath)}`);
    } else if (entry.isDirectory()) {
      out.set(childRelative, 'dir');
      snapshotTree(root, childRelative, out);
    } else if (entry.isFile()) {
      out.set(childRelative, `file:${statSync(childPath).size}`);
    } else {
      out.set(childRelative, 'other');
    }
  }
  return out;
}

function writeMigrationMarker(canonicalHome: string, legacyHome: string): void {
  const markerPath = join(canonicalHome, KIKO_HOME_MIGRATION_MARKER_FILE);
  const stagedPath = `${markerPath}.${process.pid}.tmp`;
  writeFileSync(
    stagedPath,
    `${JSON.stringify({
      schemaVersion: KIKO_HOME_MIGRATION_SCHEMA_VERSION,
      from: legacyHome,
      migratedAt: new Date().toISOString(),
      pid: process.pid,
    })}\n`,
    { mode: 0o600 },
  );
  renameSync(stagedPath, markerPath);
}