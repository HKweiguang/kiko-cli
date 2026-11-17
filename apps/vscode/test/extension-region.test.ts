/**
 * Scenario: the extension host resolves the install-channel region.
 * Responsibilities: read the marker unless KIKO_REGION_MARKER=off, and ignore the removed KIMI_CODE_* name.
 * Wiring: vscode, the oauth region resolver, and SDK config boundaries are mocked.
 * Run: pnpm exec vitest run --config apps/vscode/vitest.config.ts test/extension-region.test.ts
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => {
  const calls: Array<{ readonly readMarker?: boolean }> = [];
  return {
    calls,
    createKimiRegionResolver: vi.fn((options: { readonly readMarker?: boolean }) => {
      calls.push(options);
      const resolution = { region: "mainland-cn", source: "default" } as const;
      return { current: () => resolution, refresh: () => resolution };
    }),
    loadRuntimeConfigSafe: vi.fn(() => ({ config: { providers: {} } })),
    resolveConfigPath: vi.fn(() => "/kimi-home/config.toml"),
  };
});

vi.mock("vscode", () => ({ env: { remoteName: undefined } }));
vi.mock("@moonshot-ai/kimi-code-oauth", () => ({
  KIMI_CODE_PROVIDER_NAME: "managed:kimi-code",
  createKimiRegionResolver: host.createKimiRegionResolver,
}));
vi.mock("@moonshot-ai/kimi-code-sdk", () => ({
  loadRuntimeConfigSafe: host.loadRuntimeConfigSafe,
  resolveConfigPath: host.resolveConfigPath,
}));

import { resetExtensionRegionCache, resolveExtensionRegion } from "../src/utils/region";

describe("resolveExtensionRegion marker env", () => {
  afterEach(() => {
    resetExtensionRegionCache();
    host.calls.length = 0;
    delete process.env["KIKO_REGION_MARKER"];
    delete process.env["KIMI_CODE_REGION_MARKER"];
  });

  it("disables the install marker when KIKO_REGION_MARKER=off", () => {
    process.env["KIKO_REGION_MARKER"] = "off";

    resolveExtensionRegion({ homeDir: "/home/kiko" });

    expect(host.calls.at(-1)?.readMarker).toBe(false);
  });

  it("ignores the removed KIMI_CODE_REGION_MARKER name", () => {
    process.env["KIMI_CODE_REGION_MARKER"] = "off";

    resolveExtensionRegion({ homeDir: "/home/legacy" });

    expect(host.calls.at(-1)?.readMarker).toBe(true);
  });
});