import { mkdtempSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { afterEach, describe, expect, it } from 'vitest';

import { ErrorCodes, Error2 } from '#/errors';
import { loadMcpServers, loadMcpServersDetailed, resolveMcpJsonPaths } from '#/app/mcpConfig/configLoader';
import { HostFileSystem } from '#/os/backends/node-local/hostFsService';

const fs = new HostFileSystem();

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kimi-mcp-loader-'));
  tempDirs.push(dir);
  return dir;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(value), 'utf-8');
}

describe('resolveMcpJsonPaths', () => {
  it('returns the canonical user, project-root, and project-local paths', async () => {
    const repoRoot = makeTempDir();
    const cwd = join(repoRoot, 'packages', 'agent-core');
    await mkdir(join(repoRoot, '.git'), { recursive: true });
    await mkdir(cwd, { recursive: true });

    const paths = await resolveMcpJsonPaths({ fs, cwd, homeDir: '/home/user/.kiko' });

    expect(paths.user).toBe('/home/user/.kiko/mcp.json');
    expect(paths.projectRoot).toBe(join(repoRoot, '.mcp.json'));
    expect(paths.project).toBe(join(cwd, '.kiko', 'mcp.json'));
  });
});

describe('loadMcpServers', () => {
  it('returns an empty map when no files exist', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    const servers = await loadMcpServers({ fs, cwd, homeDir: home });
    expect(servers).toEqual({});
  });

  it('treats empty JSON files as empty maps', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeFile(join(home, 'mcp.json'), '   \n');
    const servers = await loadMcpServers({ fs, cwd, homeDir: home });
    expect(servers).toEqual({});
  });

  it('rejects a null mcpServers field', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), { mcpServers: null });

    await expect(loadMcpServers({ fs, cwd, homeDir: home })).rejects.toMatchObject({
      code: ErrorCodes.CONFIG_INVALID,
    });
  });

  it('merges project-local mcp.json with user-global, project overriding on conflict', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();

    await writeJson(join(home, 'mcp.json'), {
      mcpServers: {
        shared: { transport: 'stdio', command: 'shared-user' },
        userOnly: { transport: 'stdio', command: 'user-only' },
      },
    });
    await writeJson(join(cwd, '.kiko', 'mcp.json'), {
      mcpServers: {
        shared: { transport: 'stdio', command: 'shared-project' },
        local: { transport: 'http', url: 'http://localhost:8080/mcp' },
      },
    });

    const servers = await loadMcpServers({ fs, cwd, homeDir: home });

    expect(Object.keys(servers).toSorted()).toEqual(['local', 'shared', 'userOnly']);
    expect(servers['shared']).toEqual({
      transport: 'stdio',
      command: 'shared-project',
    });
    expect(servers['userOnly']).toEqual({
      transport: 'stdio',
      command: 'user-only',
    });
    expect(servers['local']).toEqual({
      transport: 'http',
      url: 'http://localhost:8080/mcp',
    });
  });

  it('ignores the legacy .kimi-code/mcp.json', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();

    await writeJson(join(cwd, '.kimi-code', 'mcp.json'), {
      mcpServers: {
        shared: { transport: 'stdio', command: 'legacy' },
        legacyOnly: { transport: 'stdio', command: 'legacy-only' },
      },
    });
    await writeJson(join(cwd, '.kiko', 'mcp.json'), {
      mcpServers: {
        shared: { transport: 'stdio', command: 'canonical' },
      },
    });

    const loaded = await loadMcpServersDetailed({ fs, cwd, homeDir: home });

    expect(loaded.servers['shared']).toEqual({ transport: 'stdio', command: 'canonical' });
    expect(loaded.servers['legacyOnly']).toBeUndefined();
    expect(Object.values(loaded.origins)).not.toContain(join(cwd, '.kimi-code', 'mcp.json'));
  });

  it('does not read servers from a legacy-only .kimi-code/mcp.json', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(cwd, '.kimi-code', 'mcp.json'), {
      mcpServers: { legacyOnly: { transport: 'stdio', command: 'legacy-only' } },
    });

    const loaded = await loadMcpServersDetailed({ fs, cwd, homeDir: home });

    expect(loaded.servers).toEqual({});
    expect(loaded.origins).toEqual({});
  });

  it('loads only the user file when includeProject is false (untrusted workspace)', async () => {
    const home = makeTempDir();
    const repoRoot = makeTempDir();
    const cwd = join(repoRoot, 'packages', 'agent-core');
    await mkdir(join(repoRoot, '.git'), { recursive: true });
    await mkdir(cwd, { recursive: true });

    await writeJson(join(home, 'mcp.json'), {
      mcpServers: {
        shared: { transport: 'stdio', command: 'shared-user' },
        userOnly: { transport: 'stdio', command: 'user-only' },
      },
    });
    await writeJson(join(repoRoot, '.mcp.json'), {
      mcpServers: {
        shared: { transport: 'stdio', command: 'shared-root' },
        rootOnly: { command: 'root-only' },
      },
    });
    await writeJson(join(cwd, '.kiko', 'mcp.json'), {
      mcpServers: {
        shared: { transport: 'stdio', command: 'shared-project' },
        projectOnly: { transport: 'http', url: 'https://mcp.example.com' },
      },
    });

    const servers = await loadMcpServers({ fs, cwd, homeDir: home, includeProject: false });

    expect(Object.keys(servers).toSorted()).toEqual(['shared', 'userOnly']);
    expect(servers['shared']).toEqual({
      transport: 'stdio',
      command: 'shared-user',
    });
  });

  it('loads root .mcp.json from the repo root and lets project-local override it', async () => {
    const home = makeTempDir();
    const repoRoot = makeTempDir();
    const cwd = join(repoRoot, 'packages', 'agent-core');
    await mkdir(join(repoRoot, '.git'), { recursive: true });
    await mkdir(cwd, { recursive: true });

    await writeJson(join(home, 'mcp.json'), {
      mcpServers: {
        shared: { transport: 'stdio', command: 'shared-user' },
        userOnly: { transport: 'stdio', command: 'user-only' },
      },
    });
    await writeJson(join(repoRoot, '.mcp.json'), {
      mcpServers: {
        shared: { transport: 'stdio', command: 'shared-root' },
        rootOnly: { command: 'root-only' },
      },
    });
    await writeJson(join(cwd, '.kiko', 'mcp.json'), {
      mcpServers: {
        shared: { transport: 'stdio', command: 'shared-project' },
        projectOnly: { transport: 'http', url: 'https://mcp.example.com' },
      },
    });

    const servers = await loadMcpServers({ fs, cwd, homeDir: home });

    expect(Object.keys(servers).toSorted()).toEqual([
      'projectOnly',
      'rootOnly',
      'shared',
      'userOnly',
    ]);
    expect(servers['shared']).toEqual({
      transport: 'stdio',
      command: 'shared-project',
    });
    expect(servers['rootOnly']).toEqual({ transport: 'stdio', command: 'root-only', cwd: repoRoot });
    expect(servers['userOnly']).toEqual({ transport: 'stdio', command: 'user-only' });
    expect(servers['projectOnly']).toEqual({ transport: 'http', url: 'https://mcp.example.com' });
  });

  it('resolves project-root stdio cwd relative to the root .mcp.json directory', async () => {
    const home = makeTempDir();
    const repoRoot = makeTempDir();
    const cwd = join(repoRoot, 'packages', 'agent-core');
    await mkdir(join(repoRoot, '.git'), { recursive: true });
    await mkdir(cwd, { recursive: true });

    await writeJson(join(repoRoot, '.mcp.json'), {
      mcpServers: {
        implicitRoot: { command: './bin/mcp-server' },
        explicitDot: { command: './bin/mcp-server', cwd: '.' },
        nested: { command: 'node', cwd: 'tools/mcp' },
        absolute: { command: 'node', cwd: '/tmp/mcp-workdir' },
        remote: { url: 'https://mcp.example.com' },
      },
    });

    const servers = await loadMcpServers({ fs, cwd, homeDir: home });

    expect(servers['implicitRoot']).toEqual({
      transport: 'stdio',
      command: './bin/mcp-server',
      cwd: repoRoot,
    });
    expect(servers['explicitDot']).toEqual({
      transport: 'stdio',
      command: './bin/mcp-server',
      cwd: repoRoot,
    });
    expect(servers['nested']).toEqual({
      transport: 'stdio',
      command: 'node',
      cwd: join(repoRoot, 'tools', 'mcp'),
    });
    expect(servers['absolute']).toEqual({
      transport: 'stdio',
      command: 'node',
      cwd: '/tmp/mcp-workdir',
    });
    expect(servers['remote']).toEqual({
      transport: 'http',
      url: 'https://mcp.example.com',
    });
  });

  it('keeps Windows drive-letter and UNC stdio cwd values resolved on any host', async () => {
    const home = makeTempDir();
    const repoRoot = makeTempDir();
    const cwd = join(repoRoot, 'packages', 'agent-core');
    await mkdir(join(repoRoot, '.git'), { recursive: true });
    await mkdir(cwd, { recursive: true });

    await writeJson(join(repoRoot, '.mcp.json'), {
      mcpServers: {
        drive: { command: 'node', cwd: 'C:/tools' },
        driveBackslash: { command: 'node', cwd: 'C:\\tools\\bin' },
        unc: { command: 'node', cwd: '//server/share/tools' },
      },
    });

    const servers = await loadMcpServers({ fs, cwd, homeDir: home });

    expect(servers['drive']).toMatchObject({ cwd: 'C:/tools' });
    expect(servers['driveBackslash']).toMatchObject({ cwd: 'C:/tools/bin' });
    expect(servers['unc']).toMatchObject({ cwd: '//server/share/tools' });
  });

  it('throws Error2(config.invalid) on invalid JSON', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeFile(join(home, 'mcp.json'), '{not json}', 'utf-8');
    await expect(loadMcpServers({ fs, cwd, homeDir: home })).rejects.toBeInstanceOf(Error2);
    await expect(loadMcpServers({ fs, cwd, homeDir: home })).rejects.toMatchObject({
      code: ErrorCodes.CONFIG_INVALID,
    });
  });

  it('throws Error2(config.invalid) on schema violation with unknown transport', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: { bad: { transport: 'websocket', url: 'https://x.example.com' } },
    });
    await expect(loadMcpServers({ fs, cwd, homeDir: home })).rejects.toMatchObject({
      code: ErrorCodes.CONFIG_INVALID,
    });
  });

  it('throws Error2(config.invalid) on schema violation with missing required field', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: { bad: { transport: 'stdio' } },
    });
    await expect(loadMcpServers({ fs, cwd, homeDir: home })).rejects.toMatchObject({
      code: ErrorCodes.CONFIG_INVALID,
    });
  });

  it('throws Error2(config.invalid) when an MCP timeout exceeds the Node.js timer limit', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: {
        bad: {
          transport: 'stdio',
          command: 'node',
          startupTimeoutMs: 2_147_483_648,
          toolTimeoutMs: 2_147_483_648,
        },
      },
    });
    await expect(loadMcpServers({ fs, cwd, homeDir: home })).rejects.toMatchObject({
      code: ErrorCodes.CONFIG_INVALID,
    });
  });

  it('loads MCP timeouts at the Node.js timer upper boundary', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: {
        boundary: {
          transport: 'stdio',
          command: 'node',
          startupTimeoutMs: 2_147_483_647,
          toolTimeoutMs: 2_147_483_647,
        },
      },
    });
    await expect(loadMcpServers({ fs, cwd, homeDir: home })).resolves.toEqual({
      boundary: {
        transport: 'stdio',
        command: 'node',
        startupTimeoutMs: 2_147_483_647,
        toolTimeoutMs: 2_147_483_647,
      },
    });
  });

  it('infers transport=stdio when an entry omits transport but has command', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: {
        gh: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
      },
    });
    const servers = await loadMcpServers({ fs, cwd, homeDir: home });
    expect(servers['gh']).toEqual({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
    });
  });

  it('infers transport=http when an entry omits transport but has url', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: {
        remote: { url: 'https://mcp.example.com/sse' },
      },
    });
    const servers = await loadMcpServers({ fs, cwd, homeDir: home });
    expect(servers['remote']).toEqual({
      transport: 'http',
      url: 'https://mcp.example.com/sse',
    });
  });

  it('loads explicit SSE server config', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: {
        legacy: {
          transport: 'sse',
          url: 'https://mcp.example.com/sse',
          headers: { 'X-Tenant': 'kimi' },
          bearerTokenEnvVar: 'LEGACY_MCP_TOKEN',
        },
      },
    });
    const servers = await loadMcpServers({ fs, cwd, homeDir: home });
    expect(servers['legacy']).toEqual({
      transport: 'sse',
      url: 'https://mcp.example.com/sse',
      headers: { 'X-Tenant': 'kimi' },
      bearerTokenEnvVar: 'LEGACY_MCP_TOKEN',
    });
  });

  it('honors KIKO_HOME and ignores KIMI_CODE_HOME when homeDir is not supplied', async () => {
    const home = makeTempDir();
    const legacy = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: { from_env: { transport: 'stdio', command: 'env-cmd' } },
    });
    await writeJson(join(legacy, 'mcp.json'), {
      mcpServers: { from_legacy: { transport: 'stdio', command: 'legacy-cmd' } },
    });
    const savedKiko = process.env['KIKO_HOME'];
    const savedLegacy = process.env['KIMI_CODE_HOME'];
    process.env['KIKO_HOME'] = home;
    process.env['KIMI_CODE_HOME'] = legacy;
    try {
      const servers = await loadMcpServers({ fs, cwd });
      expect(servers['from_env']).toEqual({ transport: 'stdio', command: 'env-cmd' });
      expect(servers['from_legacy']).toBeUndefined();
    } finally {
      if (savedKiko === undefined) delete process.env['KIKO_HOME'];
      else process.env['KIKO_HOME'] = savedKiko;
      if (savedLegacy === undefined) delete process.env['KIMI_CODE_HOME'];
      else process.env['KIMI_CODE_HOME'] = savedLegacy;
    }
  });
});
