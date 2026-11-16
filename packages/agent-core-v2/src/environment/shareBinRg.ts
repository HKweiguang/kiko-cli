import { join } from 'node:path';

import { resolveKimiHome } from '#/app/bootstrap/homeMigration';

import { LOCAL_ENVIRONMENT_ID, type Environment } from './environment';

const KIKO_HOME_DIR_NAME = '.kiko';
const LEGACY_KIMI_CODE_HOME_DIR_NAME = '.kimi-code';

export function isRemoteEnvironment(environment: Environment | undefined): environment is Environment {
  return environment !== undefined && environment.identity.environmentId !== LOCAL_ENVIRONMENT_ID;
}

export function getShareBinRgPath(): string {
  return join(resolveKimiHome(), 'bin', rgBinaryName());
}

export function shareBinRgPaths(environment: Environment | undefined): readonly string[] {
  if (isRemoteEnvironment(environment)) {
    const homeDir = environment.host?.homeDir;
    if (homeDir !== undefined) {
      const binary = environment.host?.pathClass === 'win32' ? 'rg.exe' : 'rg';
      const path = environment.path;
      return [
        path?.join(homeDir, KIKO_HOME_DIR_NAME, 'bin', binary) ??
          `${homeDir}/${KIKO_HOME_DIR_NAME}/bin/${binary}`,
        path?.join(homeDir, LEGACY_KIMI_CODE_HOME_DIR_NAME, 'bin', binary) ??
          `${homeDir}/${LEGACY_KIMI_CODE_HOME_DIR_NAME}/bin/${binary}`,
      ];
    }
  }
  return [getShareBinRgPath()];
}

export function shareBinRgPath(environment: Environment | undefined): string {
  return shareBinRgPaths(environment)[0]!;
}

function rgBinaryName(): string {
  return process.platform === 'win32' ? 'rg.exe' : 'rg';
}
