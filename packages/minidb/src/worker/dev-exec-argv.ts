export const TRANSFORM_TYPES_FLAG = '--experimental-transform-types';

const EXPERIMENTAL_WARNING_FLAG = '--disable-warning=ExperimentalWarning';
const REGISTER_DEPRECATION_FLAG = '--disable-warning=DEP0205';

export function transformTypesSupported(
  flags: ReadonlySet<string> = process.allowedNodeEnvironmentFlags,
): boolean {
  return flags.has(TRANSFORM_TYPES_FLAG);
}

export function devWorkerExecArgv(
  flags: ReadonlySet<string> = process.allowedNodeEnvironmentFlags,
): string[] {
  return transformTypesSupported(flags)
    ? [TRANSFORM_TYPES_FLAG, EXPERIMENTAL_WARNING_FLAG]
    : [EXPERIMENTAL_WARNING_FLAG, REGISTER_DEPRECATION_FLAG];
}