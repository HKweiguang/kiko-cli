import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  constants as fsConstants,
  cpSync,
  existsSync,
  linkSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';

import { dirname, join } from 'pathe';

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
  | 'failed';

export interface KimiHomeMigrationOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly osHomeDir?: string;
  readonly lockTimeoutMs?: number;
}

export interface ResolveKimiHomeOptions {
  readonly migrationLockTimeoutMs?: number;
}

export interface KimiHomeMigrationResult {
  readonly outcome: KimiHomeMigrationOutcome;
  readonly homeDir: string;
  readonly canonicalHome: string;
  readonly legacyHome: string;
  readonly error?: unknown;
}

export class KimiHomeMigrationLockedError extends Error {
  readonly lockPath: string;

  constructor(lockPath: string, legacyHome: string, canonicalHome: string) {
    super(
      `kiko: could not acquire the data-home migration lock at ${lockPath}; ` +
        `another kiko process may be migrating ${legacyHome} to ${canonicalHome}. ` +
        `Wait for it to finish, remove a stale lock file if no migration is running, ` +
        `or set KIKO_HOME to an explicit data directory.`,
    );
    this.name = 'KimiHomeMigrationLockedError';
    this.lockPath = lockPath;
  }
}

const stableHomes = new Map<string, string>();

export function resolveKimiHome(
  homeDir?: string,
  env: NodeJS.ProcessEnv = process.env,
  osHomeDir: string = homedir(),
  options: ResolveKimiHomeOptions = {},
): string {
  if (homeDir !== undefined) return homeDir;
  const envHome = nonEmpty(env[KIKO_HOME_ENV]) ?? nonEmpty(env[LEGACY_KIMI_CODE_HOME_ENV]);
  if (envHome !== undefined) return envHome;
  return resolveDefaultKimiHome(env, osHomeDir, options);
}

function resolveDefaultKimiHome(
  env: NodeJS.ProcessEnv,
  osHomeDir: string,
  options: ResolveKimiHomeOptions,
): string {
  const canonical = join(osHomeDir, KIKO_DATA_DIR_NAME);
  const legacy = join(osHomeDir, LEGACY_KIMI_CODE_DATA_DIR_NAME);
  const stable = stableHomes.get(osHomeDir);
  if (stable !== undefined) return stable;
  if (isCompletedHome(canonical)) {
    if (!hasMigrationMarker(canonical) && isDirectory(legacy)) {
      reportSignal(`canonical-exists:${osHomeDir}`, canonicalExistsMessage(legacy, canonical));
    }
    return canonical;
  }
  if (!isDirectory(legacy)) return canonical;
  if (!autoMigrationEnabled(env)) return legacy;
  return migrateKimiCodeHome({
    env,
    osHomeDir,
    lockTimeoutMs: options.migrationLockTimeoutMs,
  }).homeDir;
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
    const hasMarker = hasMigrationMarker(canonical);
    if (!hasMarker) {
      reportSignal(`canonical-exists:${osHomeDir}`, canonicalExistsMessage(legacy, canonical));
    }
    return rememberStable(osHomeDir, {
      ...base,
      outcome: hasMarker ? 'already-migrated' : 'canonical-exists',
      homeDir: canonical,
    });
  }
  if (!isDirectory(legacy)) {
    return { ...base, outcome: 'no-legacy', homeDir: canonical };
  }
  if (existsSync(canonical) && !isDirectory(canonical)) {
    const error = new Error(`${canonical} exists and is not a directory`);
    reportSignal(`failed:${osHomeDir}`, failedMessage(legacy, canonical, error));
    return { ...base, outcome: 'failed', homeDir: legacy, error };
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

  let lock: LockHandle | undefined;
  try {
    lock = acquireLock(lockPath, lockTimeoutMs);
  } catch (error: unknown) {
    reportSignal(`failed:${osHomeDir}`, failedMessage(legacy, canonical, error));
    return { ...base, outcome: 'failed', homeDir: legacy, error };
  }
  if (lock === undefined) {
    if (isCompletedHome(canonical)) {
      return rememberStable(osHomeDir, { ...base, outcome: 'already-migrated', homeDir: canonical });
    }
    throw new KimiHomeMigrationLockedError(lockPath, legacy, canonical);
  }

  const staging = join(
    dirname(resolveCanonicalDirectory(canonical)),
    `${KIKO_DATA_DIR_NAME}-migrating-${process.pid}-${randomUUID()}`,
  );
  try {
    if (isCompletedHome(canonical)) {
      return rememberStable(osHomeDir, { ...base, outcome: 'already-migrated', homeDir: canonical });
    }
    if (!isDirectory(legacy)) {
      return { ...base, outcome: 'no-legacy', homeDir: canonical };
    }

    const canonicalDirectory = resolveCanonicalDirectory(canonical);
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

      if (existsSync(canonicalDirectory)) {
        if (!isDirectory(canonicalDirectory) || readdirSync(canonicalDirectory).length > 0) {
          reportSignal(`canonical-exists:${osHomeDir}`, canonicalExistsMessage(legacy, canonical));
          return rememberStable(osHomeDir, { ...base, outcome: 'canonical-exists', homeDir: canonical });
        }
        rmdirSync(canonicalDirectory);
      }
      renameSync(staging, canonicalDirectory);
      writeMigrationMarker(canonical, legacy);
      reportSignal(
        `migrated:${osHomeDir}`,
        `kiko: migrated data home ${legacy} -> ${canonical}; the legacy directory was kept as a backup.`,
      );
      return rememberStable(osHomeDir, { ...base, outcome: 'migrated', homeDir: canonical });
    } catch (error: unknown) {
      if (isCompletedHome(canonical)) {
        return rememberStable(osHomeDir, { ...base, outcome: 'already-migrated', homeDir: canonical });
      }
      reportSignal(`failed:${osHomeDir}`, failedMessage(legacy, canonical, error));
      return {
        ...base,
        outcome: 'failed',
        homeDir: isDirectory(legacy) ? legacy : canonical,
        error,
      };
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
    releaseLock(lockPath, lock.token);
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

function resolveCanonicalDirectory(canonical: string): string {
  try {
    if (lstatSync(canonical).isSymbolicLink()) return realpathSync(canonical);
  } catch {
    // Missing canonical: rename creates it.
  }
  return canonical;
}

function rememberStable(osHomeDir: string, result: KimiHomeMigrationResult): KimiHomeMigrationResult {
  if (
    result.outcome === 'migrated' ||
    result.outcome === 'already-migrated' ||
    result.outcome === 'canonical-exists'
  ) {
    stableHomes.set(osHomeDir, result.homeDir);
  }
  return result;
}

const reportedSignals = new Set<string>();

function reportSignal(key: string, message: string): void {
  if (process.env['VITEST'] !== undefined) return;
  if (reportedSignals.has(key)) return;
  reportedSignals.add(key);
  process.stderr.write(`${message}\n`);
}

function failedMessage(legacy: string, canonical: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return (
    `kiko: could not migrate ${legacy} to ${canonical} (${detail}); ` +
    `continuing with ${legacy}. Fix the cause and restart to retry.`
  );
}

function canonicalExistsMessage(legacy: string, canonical: string): string {
  return (
    `kiko: ${canonical} already contains data but has no ${KIKO_HOME_MIGRATION_MARKER_FILE}; ` +
    `left ${legacy} untouched. If ${legacy} is your real home, move ${canonical} aside and ` +
    `restart, or set KIKO_HOME=${legacy} to keep using it.`
  );
}

interface LockHandle {
  readonly token: string;
}

function acquireLock(lockPath: string, timeoutMs: number): LockHandle | undefined {
  const token = `${process.pid}-${randomUUID()}`;
  const tempPath = `${lockPath}.${token}.tmp`;
  writeFileSync(
    tempPath,
    JSON.stringify({ pid: process.pid, token, startedAt: Date.now() }),
    { mode: 0o600 },
  );
  const deadline = Date.now() + timeoutMs;
  try {
    for (;;) {
      try {
        linkSync(tempPath, lockPath);
        return { token };
      } catch (error: unknown) {
        if (!isAlreadyExists(error)) throw error;
      }
      const raw = readLockRaw(lockPath);
      if (raw === undefined) {
        if (Date.now() >= deadline) return undefined;
        sleepSync(LOCK_POLL_MS);
        continue;
      }
      if (isStaleLockContent(raw)) {
        removeLockIfUnchanged(lockPath, raw);
        continue;
      }
      if (Date.now() >= deadline) return undefined;
      sleepSync(LOCK_POLL_MS);
    }
  } finally {
    rmSync(tempPath, { force: true });
  }
}

function releaseLock(lockPath: string, token: string): void {
  const raw = readLockRaw(lockPath);
  if (raw === undefined) return;
  let parsed: { token?: unknown };
  try {
    parsed = JSON.parse(raw) as { token?: unknown };
  } catch {
    return;
  }
  if (parsed.token !== token) return;
  rmSync(lockPath, { force: true });
}

function readLockRaw(lockPath: string): string | undefined {
  try {
    return readFileSync(lockPath, 'utf-8');
  } catch {
    return undefined;
  }
}

function removeLockIfUnchanged(lockPath: string, raw: string): void {
  if (readLockRaw(lockPath) !== raw) return;
  rmSync(lockPath, { force: true });
}

function isAlreadyExists(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'EEXIST';
}

function isStaleLockContent(raw: string): boolean {
  let lock: { pid?: unknown; startedAt?: unknown };
  try {
    lock = JSON.parse(raw) as { pid?: unknown; startedAt?: unknown };
  } catch {
    return true;
  }
  if (typeof lock.pid === 'number' && Number.isInteger(lock.pid)) {
    return !isProcessAlive(lock.pid);
  }
  const startedAt = typeof lock.startedAt === 'number' ? lock.startedAt : undefined;
  return startedAt === undefined || Date.now() - startedAt > STALE_LOCK_AGE_MS;
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
      const stat = statSync(childPath);
      out.set(childRelative, `file:${stat.size}${modeSuffix(stat.mode)}`);
    } else {
      out.set(childRelative, 'other');
    }
  }
  return out;
}

function modeSuffix(mode: number): string {
  return process.platform === 'win32' ? '' : `:${(mode & 0o777).toString(8)}`;
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