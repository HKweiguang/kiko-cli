import { join } from 'node:path';

import { resolveKimiHome } from '#/app/bootstrap/home';

import { LOCAL_ENVIRONMENT_ID, type Environment } from './environment';

const KIKO_HOME_DIR_NAME = '.kiko';

export function isRemoteEnvironment(environment: Environment | undefined): environment is Environment {
  return environment !== undefined && environment.identity.environmentId !== LOCAL_ENVIRONMENT_ID;
}

export function getShareBinRgPath(): string {
  return join(resolveKimiHome(), 'bin', rgBinaryName());
}

export function shareBinRgPath(environment: Environment | undefined): string {
  if (isRemoteEnvironment(environment)) {
    const homeDir = environment.host?.homeDir;
    if (homeDir !== undefined) {
      const binary = environment.host?.pathClass === 'win32' ? 'rg.exe' : 'rg';
      return (
        environment.path?.join(homeDir, KIKO_HOME_DIR_NAME, 'bin', binary) ??
        `${homeDir}/${KIKO_HOME_DIR_NAME}/bin/${binary}`
      );
    }
  }
  return getShareBinRgPath();
}

function rgBinaryName(): string {
  return process.platform === 'win32' ? 'rg.exe' : 'rg';
}
