import { homedir } from 'node:os';

import { join } from 'pathe';

export const KIKO_HOME_ENV = 'KIKO_HOME';
export const KIKO_DATA_DIR_NAME = '.kiko';

/**
 * Resolve the Kiko data home: an explicit `homeDir`, else `KIKO_HOME`, else
 * `~/.kiko`.
 */
export function resolveKimiHome(
  homeDir?: string,
  env: NodeJS.ProcessEnv = process.env,
  osHomeDir: string = homedir(),
): string {
  if (homeDir !== undefined) return homeDir;
  const envHome = nonEmpty(env[KIKO_HOME_ENV]);
  if (envHome !== undefined) return envHome;
  return join(osHomeDir, KIKO_DATA_DIR_NAME);
}

function nonEmpty(value: string | undefined): string | undefined {
  return value !== undefined && value.length > 0 ? value : undefined;
}
