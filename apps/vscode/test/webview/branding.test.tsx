/**
 * Scenario: users read the product name in the webview chrome, sign-in screen,
 * and startup-error screen.
 * Responsibilities: the extension surfaces itself as Kiko while the Kimi account
 * and the upstream Kimi Code subscription keep their names.
 * Wiring: components render against a mocked bridge; no VS Code host required.
 * Run: pnpm exec vitest run --config apps/vscode/vitest.config.ts test/webview/branding.test.tsx
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/services", () => ({
  bridge: {
    on: vi.fn(() => () => undefined),
    checkLoginStatus: vi.fn(() => new Promise(() => undefined)),
    login: vi.fn(),
    showLogs: vi.fn(),
  },
  Events: { LoginUrl: "loginUrl" },
}));

import { ConfigErrorScreen } from "../../webview-ui/src/components/ConfigErrorScreen";
import { Header } from "../../webview-ui/src/components/Header";
import { LoginScreen } from "../../webview-ui/src/components/LoginScreen";
import { providerDisplayName } from "../../webview-ui/src/stores/settings.store";

describe("Kiko display identity in the webview", () => {
  it("labels the chat header as Kiko", () => {
    render(<Header />);

    expect(screen.getByText("Kiko")).toBeTruthy();
    expect(screen.queryByText("Kimi Code")).toBeNull();
  });

  it("welcomes users to Kiko without renaming the Kimi account or subscription", () => {
    render(<LoginScreen onLoginSuccess={() => undefined} onSkip={() => undefined} />);

    expect(screen.getByRole("heading", { name: "Welcome to Kiko" })).toBeTruthy();
    expect(
      screen.getByText("Use Kiko with your Kimi account subscription or your existing API setup."),
    ).toBeTruthy();
    expect(screen.getByText("Use your Kimi account and Kimi Code subscription.")).toBeTruthy();
    expect(screen.queryByText("Welcome to Kimi Code")).toBeNull();
  });

  it("reports startup failures under the Kiko name", () => {
    const { rerender } = render(<ConfigErrorScreen type="loading" />);
    expect(screen.getByText("Starting Kiko…")).toBeTruthy();

    rerender(<ConfigErrorScreen type="runtime-error" errorMessage="boom" />);
    expect(screen.getByText("Kiko could not start")).toBeTruthy();
    expect(
      screen.getByText(
        "Check the error below. Full diagnostics are available in the Kiko output channel.",
      ),
    ).toBeTruthy();
  });

  it("uses Kiko as the managed provider label without changing the provider key", () => {
    expect(providerDisplayName("managed:kimi-code")).toBe("Kiko");
  });
});