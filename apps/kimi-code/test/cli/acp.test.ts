/**
 * `kiko acp`
 *
 * Verifies that the ACP sub-command is registered on the program and that
 * the action wires `@moonshot-ai/acp-server`'s `runAcpServer` (the real server
 * is stubbed so the test doesn't actually take over stdio). The module is
 * loaded via a lazy dynamic import in the action, so the mock intercepts that
 * import.
 */

import { Command, Option } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@moonshot-ai/acp-server', () => ({
  runAcpServer: vi.fn(async () => undefined),
}));

import { runAcpServer } from '@moonshot-ai/acp-server';

import { registerAcpCommand } from '#/cli/sub/acp';
import { getDataDir } from '#/utils/paths';

const originalHomeEnv = {
  kiko: process.env['KIKO_HOME'],
  legacy: process.env['KIMI_CODE_HOME'],
};

function setHomeEnv(kiko: string | undefined, legacy: string | undefined): void {
  if (kiko === undefined) delete process.env['KIKO_HOME'];
  else process.env['KIKO_HOME'] = kiko;
  if (legacy === undefined) delete process.env['KIMI_CODE_HOME'];
  else process.env['KIMI_CODE_HOME'] = legacy;
}

class ExitCalled extends Error {
  constructor(public code: number | string | null | undefined) {
    super(`process.exit(${String(code)})`);
  }
}

describe('kiko acp', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(runAcpServer).mockClear();
    setHomeEnv(undefined, undefined);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number | string | null) => {
      throw new ExitCalled(code);
    }) as never);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    setHomeEnv(originalHomeEnv.kiko, originalHomeEnv.legacy);
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('registers an `acp` subcommand on the program', () => {
    const program = new Command('kimi');
    registerAcpCommand(program);

    const acp = program.commands.find((c) => c.name() === 'acp');
    expect(acp).toBeDefined();
    expect(acp?.description()).toMatch(/Agent Client Protocol/);
  });

  it('invokes runAcpServer with the host options and exits 0 on success', async () => {
    const program = new Command('kimi').exitOverride();
    registerAcpCommand(program);

    await expect(program.parseAsync(['node', 'kimi', 'acp'])).rejects.toThrow(ExitCalled);

    expect(runAcpServer).toHaveBeenCalledTimes(1);
    const optsArg = vi.mocked(runAcpServer).mock.calls[0]?.[0];
    expect(optsArg).toEqual(
      expect.objectContaining({
        homeDir: getDataDir(),
        agentInfo: { name: 'Kiko CLI', version: expect.any(String) },
      }),
    );
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('forwards KIKO_HOME to terminalAuthEnv and homeDir when set', async () => {
    setHomeEnv('/tmp/kiko-home', undefined);
    const program = new Command('kimi').exitOverride();
    registerAcpCommand(program);

    await expect(program.parseAsync(['node', 'kimi', 'acp'])).rejects.toThrow(ExitCalled);

    const optsArg = vi.mocked(runAcpServer).mock.calls[0]?.[0];
    expect(optsArg).toEqual(
      expect.objectContaining({
        homeDir: '/tmp/kiko-home',
        terminalAuthEnv: {
          KIKO_HOME: '/tmp/kiko-home',
          KIMI_CODE_HOME: '/tmp/kiko-home',
        },
      }),
    );
  });

  it('falls back to KIMI_CODE_HOME and forwards it under the canonical name', async () => {
    setHomeEnv(undefined, '/tmp/kimi-debug');
    const program = new Command('kimi').exitOverride();
    registerAcpCommand(program);

    await expect(program.parseAsync(['node', 'kimi', 'acp'])).rejects.toThrow(ExitCalled);

    const optsArg = vi.mocked(runAcpServer).mock.calls[0]?.[0];
    expect(optsArg).toEqual(
      expect.objectContaining({
        homeDir: '/tmp/kimi-debug',
        terminalAuthEnv: {
          KIKO_HOME: '/tmp/kimi-debug',
          KIMI_CODE_HOME: '/tmp/kimi-debug',
        },
      }),
    );
  });

  it('prefers KIKO_HOME over KIMI_CODE_HOME and advertises one effective home', async () => {
    setHomeEnv('/tmp/kiko-home', '/tmp/kimi-legacy');
    const program = new Command('kimi').exitOverride();
    registerAcpCommand(program);

    await expect(program.parseAsync(['node', 'kimi', 'acp'])).rejects.toThrow(ExitCalled);

    const optsArg = vi.mocked(runAcpServer).mock.calls[0]?.[0];
    expect(optsArg).toEqual(
      expect.objectContaining({
        homeDir: '/tmp/kiko-home',
        terminalAuthEnv: {
          KIKO_HOME: '/tmp/kiko-home',
          KIMI_CODE_HOME: '/tmp/kiko-home',
        },
      }),
    );
  });

  it('omits terminalAuthEnv when neither home variable is set', async () => {
    const program = new Command('kimi').exitOverride();
    registerAcpCommand(program);

    await expect(program.parseAsync(['node', 'kimi', 'acp'])).rejects.toThrow(ExitCalled);

    const optsArg = vi.mocked(runAcpServer).mock.calls[0]?.[0] as {
      homeDir?: string;
      terminalAuthEnv?: unknown;
    };
    expect(optsArg.terminalAuthEnv).toBeUndefined();
    expect(optsArg.homeDir).toBe(getDataDir());
  });

  it('forwards process.argv[1] as terminalAuthLegacyCommand', async () => {
    const program = new Command('kimi').exitOverride();
    registerAcpCommand(program);

    await expect(program.parseAsync(['node', 'kimi', 'acp'])).rejects.toThrow(ExitCalled);

    const optsArg = vi.mocked(runAcpServer).mock.calls[0]?.[0] as {
      terminalAuthLegacyCommand?: string;
    };
    // process.argv[1] points at the test runner entry — non-empty
    // absolute-ish path, exactly what we want forwarded.
    expect(typeof optsArg.terminalAuthLegacyCommand).toBe('string');
    expect((optsArg.terminalAuthLegacyCommand ?? '').length).toBeGreaterThan(0);
    expect(optsArg.terminalAuthLegacyCommand).toBe(process.argv[1]);
  });

  it('rejects a root-level --environment instead of silently ignoring it', async () => {
    const program = new Command('kimi').exitOverride().enablePositionalOptions();
    program.addOption(new Option('--environment <id>').hideHelp());
    registerAcpCommand(program);

    await expect(
      program.parseAsync(['node', 'kimi', '--environment', 'dev-box', 'acp']),
    ).rejects.toThrow(ExitCalled);

    expect(runAcpServer).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    const stderr = stderrSpy.mock.calls.map((call: unknown[]) => String(call[0])).join('');
    expect(stderr).toContain("--environment");
    expect(stderr).toContain('acp');
  });

  it('exits without starting the ACP server when --login is passed', async () => {
    // Stub the SDK harness so runLoginFlow doesn't hit a real OAuth endpoint:
    // harness.auth.login resolves immediately and triggers exit 0.
    const loginStub = vi.fn(async () => ({ providerName: 'kimi-code' }));
    vi.doMock(import('@moonshot-ai/kimi-code-sdk'), async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        createKimiHarness: () =>
          ({
            auth: { login: loginStub },
          }) as unknown as ReturnType<typeof actual.createKimiHarness>,
      };
    });
    vi.resetModules();
    const { registerAcpCommand: freshRegister } = await import('#/cli/sub/acp');
    try {
      const program = new Command('kimi').exitOverride();
      freshRegister(program);

      await expect(program.parseAsync(['node', 'kimi', 'acp', '--login'])).rejects.toThrow(
        ExitCalled,
      );

      expect(loginStub).toHaveBeenCalledTimes(1);
      expect(runAcpServer).not.toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      vi.doUnmock('@moonshot-ai/kimi-code-sdk');
      vi.resetModules();
    }
  });
});
