/**
 * Scenario: users see the extension's display identity in VS Code and the Marketplace.
 * Responsibilities: the display name, command titles, view titles, and descriptions
 * say Kiko, while the extension id, command ids, setting keys, and view ids stay
 * compatible with existing installations.
 * Wiring: reads the real package.json manifest; no editor host required.
 * Run: pnpm exec vitest run --config apps/vscode/vitest.config.ts test/package-manifest.test.ts
 */
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

interface ContributedView {
  id: string;
  name: string;
}

interface PackageManifest {
  name: string;
  publisher: string;
  displayName: string;
  description: string;
  contributes: {
    configuration: {
      title: string;
      properties: Record<string, unknown>;
    };
    commands: Array<{ command: string; title: string }>;
    viewsContainers: {
      activitybar: Array<{ id: string; title: string }>;
    };
    views: Record<string, ContributedView[]>;
  };
}

const EXPECTED_COMMAND_IDS = [
  "kimi.clearAllState",
  "kimi.openInTab",
  "kimi.openInSideBar",
  "kimi.focusInput",
  "kimi.insertMention",
  "kimi.newConversation",
  "kimi.showLogs",
  "kimi.resetKimi",
  "kimi.logout",
  "kimi.migrateLegacyData",
];

const EXPECTED_SETTING_KEYS = [
  "kimi.yoloMode",
  "kimi.autosave",
  "kimi.enableNewConversationShortcut",
  "kimi.useCtrlEnterToSend",
  "kimi.showThinkingContent",
  "kimi.showThinkingExpanded",
  "kimi.editorContext",
];

async function readManifest(): Promise<PackageManifest> {
  const text = await readFile(new URL("../package.json", import.meta.url), "utf8");
  return JSON.parse(text) as PackageManifest;
}

describe("VS Code extension display identity", () => {
  it("presents itself as Kiko while keeping the marketplace extension id", async () => {
    const manifest = await readManifest();

    expect(manifest.displayName).toBe("Kiko");
    expect(manifest.description).toBe("Official Kiko plugin for VS Code");
    expect(manifest.publisher).toBe("moonshot-ai");
    expect(manifest.name).toBe("kimi-code");
    expect(`${manifest.publisher}.${manifest.name}`).toBe("moonshot-ai.kimi-code");
  });

  it("titles every command under Kiko without changing the command ids", async () => {
    const manifest = await readManifest();
    const commands = manifest.contributes.commands;

    expect(commands.map((command) => command.command)).toEqual(EXPECTED_COMMAND_IDS);
    for (const command of commands) {
      expect(command.title.startsWith("Kiko: ")).toBe(true);
    }
  });

  it("titles the settings section and the sidebar view under Kiko without changing their ids", async () => {
    const manifest = await readManifest();

    expect(manifest.contributes.configuration.title).toBe("Kiko");
    expect(Object.keys(manifest.contributes.configuration.properties)).toEqual(EXPECTED_SETTING_KEYS);

    expect(manifest.contributes.viewsContainers.activitybar).toEqual([
      expect.objectContaining({ id: "kimi-sidebar", title: "Kiko" }),
    ]);
    expect(manifest.contributes.views["kimi-sidebar"]).toEqual([
      expect.objectContaining({ id: "kimi.webview", name: "Kiko" }),
    ]);
  });

  it("leaves no Kimi Code label in the manifest's user-visible strings", async () => {
    const manifest = await readManifest();
    const labels = [
      manifest.displayName,
      manifest.description,
      manifest.contributes.configuration.title,
      ...manifest.contributes.commands.map((command) => command.title),
      ...manifest.contributes.viewsContainers.activitybar.map((container) => container.title),
      ...Object.values(manifest.contributes.views).flat().map((view) => view.name),
    ];

    expect(labels.filter((label) => label.includes("Kimi Code"))).toEqual([]);
  });
});