import { describe, expect, test } from 'vitest';
import { devWorkerExecArgv } from '../../src/worker/dev-exec-argv.js';

describe('devWorkerExecArgv', () => {
  test('applies the transform-types flag only on runtimes that report support', () => {
    expect(devWorkerExecArgv(new Set(['--experimental-transform-types']))).toEqual([
      '--experimental-transform-types',
      '--disable-warning=ExperimentalWarning',
    ]);
    expect(devWorkerExecArgv(new Set(['--experimental-strip-types']))).toEqual([
      '--disable-warning=ExperimentalWarning',
      '--disable-warning=DEP0205',
    ]);
  });

  test('never passes a flag the current runtime rejects', () => {
    const argv = devWorkerExecArgv();
    expect(argv.includes('--experimental-transform-types')).toBe(
      process.allowedNodeEnvironmentFlags.has('--experimental-transform-types'),
    );
    for (const flag of argv) {
      expect(process.allowedNodeEnvironmentFlags.has(flag.split('=')[0])).toBe(true);
    }
  });
});