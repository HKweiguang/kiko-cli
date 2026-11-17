import { describe, expect, it, vi } from 'vitest';

import { FakeEnvironment } from '#/environment/fakeEnvironment';
import {
  ensureRgPath,
  getShareBinRgPath,
  type RgProbe,
} from '#/workspace/workspaceFs/internal/rgLocator';
import { stubRgProbe } from '../../os/stubs';

function probeWith(
  resolveExitCode: (args: readonly string[]) => number,
): RgProbe & { exec: ReturnType<typeof vi.fn> } {
  return stubRgProbe(resolveExitCode);
}

function remoteEnvironment(environmentId: string, homeDir = '/home/remote'): FakeEnvironment {
  return new FakeEnvironment(
    { environmentId, generation: `${environmentId}-g1` },
    { capabilities: ['process'], host: { homeDir } },
  );
}

function localEnvironment(): FakeEnvironment {
  return new FakeEnvironment(
    { environmentId: 'local', generation: 'local-g1' },
    { capabilities: ['process'] },
  );
}

describe('ensureRgPath cached fallback', () => {
  it('probes the canonical share bin on a remote environment, never the local one', async () => {
    const probe = probeWith((args) => (args[0] === 'rg' ? -1 : 0));

    const resolution = await ensureRgPath(probe, {
      environment: remoteEnvironment('ssh-dev'),
      allowCachedFallback: true,
    });

    expect(resolution).toEqual({
      path: '/home/remote/.kiko/bin/rg',
      source: 'share-bin-cached',
    });
    expect(probe.exec).toHaveBeenCalledWith(['/home/remote/.kiko/bin/rg', '--version']);
    expect(probe.exec).not.toHaveBeenCalledWith([getShareBinRgPath(), '--version']);
  });

  it('falls back to a canonical .kiko share bin on a remote environment', async () => {
    const probe = probeWith((args) => (args[0] === 'rg' ? -1 : 0));

    const resolution = await ensureRgPath(probe, {
      environment: remoteEnvironment('ssh-legacy'),
      allowCachedFallback: true,
    });

    expect(resolution).toEqual({ path: '/home/remote/.kiko/bin/rg', source: 'share-bin-cached' });
  });

  it('falls back to the legacy .kimi-code share bin when the canonical one is missing', async () => {
    const legacy = '/home/remote/.kimi-code/bin/rg';
    const probe = probeWith((args) => (args[0] === 'rg' ? -1 : args[0] === legacy ? 0 : -1));

    const resolution = await ensureRgPath(probe, {
      environment: remoteEnvironment('ssh-legacy'),
      allowCachedFallback: true,
    });

    expect(resolution).toEqual({ path: legacy, source: 'share-bin-cached' });
    expect(probe.exec).toHaveBeenCalledWith(['/home/remote/.kiko/bin/rg', '--version']);
    expect(probe.exec).toHaveBeenCalledWith([legacy, '--version']);
  });

  it('probes the local share bin on the local environment', async () => {
    const probe = probeWith((args) => (args[0] === 'rg' ? -1 : 0));

    const resolution = await ensureRgPath(probe, {
      environment: localEnvironment(),
      allowCachedFallback: true,
    });

    expect(resolution).toEqual({ path: getShareBinRgPath(), source: 'share-bin-cached' });
  });
});
