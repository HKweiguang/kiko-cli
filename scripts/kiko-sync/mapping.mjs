export const PRODUCT_NAME = 'Kiko';
export const CLI_COMMAND_NAME = 'kiko';

export const PRODUCT_PHRASES = [
  {
    id: 'kimi-code',
    pattern: /\bKimi Code\b/g,
    replacement: 'Kiko',
    reason: 'The CLI and product name is Kiko.',
  },
  {
    id: 'kimi-cli',
    pattern: /\bKimi CLI\b/g,
    replacement: 'Kiko CLI',
    reason: 'The CLI product name is Kiko CLI.',
  },
  {
    id: 'kimi-server',
    pattern: /\bKimi server\b/g,
    replacement: 'Kiko server',
    reason: 'The local web server is called Kiko server.',
  },
];

export const LEGACY_COMMAND_PATTERNS = [
  {
    id: 'backticked-command',
    pattern: /`kimi (([a-z][\w-]*|--?[\w-]+)([^`\n]*))`/g,
    apply: (match) => `\`kiko ${match[1]}\``,
    reason: 'CLI copy may only show the kiko command.',
  },
  {
    id: 'bare-command',
    pattern:
      /(?<![\w@/.-])kimi ((?:web|rc|remote|server|upgrade|update|install-desktop|install-app|provider|fork|session|export|vis|acp|app|login|logout|migrate|doctor|import-sessions|exec-server|ensure-daemon|kill)\b(?![\w/-]))/g,
    apply: (match) => `kiko ${match[1]}`,
    reason: 'CLI copy may only show the kiko command.',
  },
  {
    id: 'package-runner-command',
    pattern: /\b(npx|uvx|pnpx) kimi\b/g,
    apply: (match) => `${match[1]} kiko`,
    reason: 'Package-runner examples invoke the kiko command.',
  },
  {
    id: 'flag-command',
    pattern: /(?<![\w@/.-])kimi (?=--?(?:p|print|version|help)\b)/g,
    apply: (match) => match[0].replace('kimi', 'kiko'),
    reason: 'CLI flag examples invoke the kiko command.',
  },
];

export const COMMAND_ALLOWLIST = [
  {
    id: 'exec-server-log-prefix',
    pattern: /\[kimi exec-server\]/g,
    reason: 'The remote executor stderr prefix is a log name and stays unchanged.',
  },
];

export const PLATFORM_CONTEXT_ALLOWLIST = [
  {
    id: 'oauth',
    pattern: /\bKimi Code OAuth\b|\bKimi Code 走 OAuth\b/g,
    reason: 'Kimi Code OAuth is the platform sign-in identity, not the CLI product.',
  },
  {
    id: 'account',
    pattern: /\bKimi Code accounts?\b|\bKimi Code 账号/g,
    reason: 'Kimi Code account names the platform account that owns credentials and quota.',
  },
  {
    id: 'plan',
    pattern: /\bKimi Code (?:plans?|subscriptions?)\b|\bKimi Code 套餐(?:额度)?/g,
    reason: 'Kimi Code plan and quota identities belong to the platform billing system.',
  },
  {
    id: 'platform',
    pattern: /\bKimi Code (?:platform|console)\b|\bKimi Code (?:平台|控制台)/g,
    reason: 'Kimi Code platform and console are external platform identities.',
  },
  {
    id: 'managed-service',
    pattern:
      /\bKimi Code managed service\b|\bby the Kimi Code service\b|\bfrom the Kimi Code service\b|\bthe Kimi Code service controls\b|\bKimi Code 托管(?:服务|账号)|由 Kimi Code 服务|从[^。\n]*Kimi Code 服务|Kimi Code 服务设定/g,
    reason: 'The managed platform service keeps the Kimi Code name in remote-service docs and errors.',
  },
  {
    id: 'models',
    pattern:
      /\bKimi Code models? endpoint\b|\bKimi Code model "|\bManaged Kimi Code model\b|\bFailed to list Kimi Code models\b|\bNo models available for Kimi Code\b/g,
    reason: 'Managed model endpoint errors and telemetry field descriptions name the Kimi Code platform.',
  },
  {
    id: 'cdn',
    pattern: /\bKimi Code release CDN\b/g,
    reason: 'The release CDN is a platform distribution identity and keeps its name.',
  },
  {
    id: 'legacy-home',
    pattern: /\bKimi Code home\b/g,
    reason: 'The legacy KIMI_SHARE_DIR migration notice names the historical data home.',
  },
  {
    id: 'provider-label',
    pattern: /\bKimi Code \(OAuth\)|\bKimi Code（OAuth）/g,
    reason: 'The OAuth provider option is shown with its platform name.',
  },
  {
    id: 'login-label',
    pattern: /\bKimi Code \(kimi\.(?:com|ai)\/code\)/g,
    reason: 'The login platform selector shows the platform name and console URL.',
  },
  {
    id: 'provider-name-value',
    pattern: /\bprovider(?:_name|Name)["']?\s*:\s*["']Kimi Code["']/g,
    reason: 'The managed provider display name is the platform identity "Kimi Code".',
  },
  {
    id: 'provider-name-binding',
    pattern: /\b(?:const|let|var)\s+providerName\s*=\s*["']Kimi Code["']/g,
    reason: 'A provider display-name binding names the platform identity "Kimi Code".',
  },
  {
    id: 'auth-key-hint',
    pattern: /select "Kimi Code" instead/g,
    reason: 'The login hint distinguishes a Kimi Code API key from other providers.',
  },
  {
    id: 'provider-hint',
    pattern: /\bobtained from Kimi Code\b/g,
    reason: 'The login hint distinguishes a Kimi Code API key from other providers.',
  },
  {
    id: 'reserved-name',
    pattern: /\breserved by Kimi Code\b/g,
    reason: 'The custom-registry error names the platform that reserved the provider id.',
  },
  {
    id: 'docs-skill',
    pattern: /\b(?:What|Using) Kimi Code (?:is|in)\b/g,
    reason: 'The docs skill describes the platform documentation it answers from.',
  },
  {
    id: 'integration-switch',
    pattern: /\*\*Kimi Code\*\* (?:switch|开关)/g,
    reason: 'The IDE integration switch is labelled with the platform name.',
  },
  {
    id: 'data-plugin',
    pattern: /\bKimi Code data plugin\b|\bKimi Code 官方数据插件/g,
    reason: 'Kimi Datasource is a plugin of the Kimi Code platform.',
  },
  {
    id: 'product-questions',
    pattern: /\bKimi Code product questions\b|\bKimi Code 产品问题/g,
    reason: 'The docs skill answers questions about the Kimi Code platform product.',
  },
  {
    id: 'uses-oauth',
    pattern: /\bKimi Code uses OAuth\b/g,
    reason: 'The login description names the platform account type.',
  },
  {
    id: 'historical-version',
    pattern: /之前的 Kimi Code 版本/g,
    reason: 'The migration reference names historical Kimi Code releases.',
  },
  {
    id: 'upstream-project',
    pattern: /\b(?:branch|fork|upstream|follows|tracks)\b[^.\n]*\bKimi Code CLI\b/gi,
    reason: 'README and security text attribute the upstream project this fork tracks.',
  },
  {
    id: 'upstream-project-link',
    pattern: /\[Kimi Code CLI\]\(https?:\/\/github\.com\/MoonshotAI\/kimi-code\)/g,
    reason: 'Inline links attribute the upstream Kimi Code CLI project.',
  },
  {
    id: 'upstream-project-zh',
    pattern: /与上游 Kimi Code CLI/g,
    reason: 'Chinese README text attributes the upstream project this fork tracks.',
  },
  {
    id: 'upstream-link',
    pattern: /\[Kimi Code\]\(https?:\/\/github\.com\/MoonshotAI\/kimi-code\)/g,
    reason: 'Inline links attribute the upstream Kimi Code repository.',
  },
  {
    id: 'npm-package-description',
    pattern:
      /\bKimi Code server backed by the DI × Scope agent engine\b|\bShared telemetry infrastructure for Kimi Code\b|\bOAuth toolkit for managed Kimi Code authentication\b|\bTypeScript SDK for the Kimi Code Agent\b|\bKimi Code product logic shared by clients and hosts\b/g,
    reason: 'Descriptions of the platform-scoped @moonshot-ai/kimi-code-* npm packages keep the Kimi Code name.',
  },
  {
    id: 'npm-package-readme',
    pattern:
      /\bThe TypeScript SDK for Kimi Code\b|\bOAuth toolkit for Kimi Code managed authentication\b/g,
    reason: 'README titles of the platform-scoped @moonshot-ai/kimi-code-* npm packages keep the Kimi Code name.',
  },
];

export const KNOWN_RESIDUALS = [
  {
    id: 'security-version-command',
    path: /(^|\/)SECURITY\.md$/,
    pattern: /`kimi --version`/g,
    finding: 'SECURITY.md still shows the retired kimi command',
    reason: 'Tracked by a Tower finding outside the harness scope; remove this entry after the fix.',
  },
  {
    id: 'flake-description',
    path: /(^|\/)flake\.nix$/,
    pattern: /description = "Kimi Code CLI";/g,
    finding: 'flake.nix user-visible descriptions still say "Kimi Code CLI"',
    reason: 'Tracked by a Tower finding outside the harness scope; remove this entry after the fix.',
  },
  {
    id: 'flake-node-error',
    path: /(^|\/)flake\.nix$/,
    pattern: /Kimi Code requires Node\.js/g,
    finding: 'flake.nix user-visible descriptions still say "Kimi Code CLI"',
    reason: 'Tracked by a Tower finding outside the harness scope; remove this entry after the fix.',
  },
  {
    id: 'flake-target-error',
    path: /(^|\/)flake\.nix$/,
    pattern: /Unsupported Kimi Code native target/g,
    finding: 'flake.nix user-visible descriptions still say "Kimi Code CLI"',
    reason: 'Tracked by a Tower finding outside the harness scope; remove this entry after the fix.',
  },
];

export const PLATFORM_IDENTITIES = [
  {
    id: 'provider-name-constant',
    value: 'KIMI_CODE_PROVIDER_NAME',
    evidence: 'packages/oauth/src/managed-kimi-code.ts',
    reason: 'Exported OAuth provider constant consumed by kap-server and the SDK.',
  },
  {
    id: 'provider-key',
    value: 'managed:kimi-code',
    evidence: 'packages/oauth/src/managed-kimi-code.ts',
    reason: 'OAuth provider key stored in config.toml and accepted by the server API.',
  },
  {
    id: 'oauth-key',
    value: 'oauth/kimi-code',
    evidence: 'packages/oauth/src/managed-kimi-code.ts',
    reason: 'Credential slot read from existing logins and the keyring.',
  },
  {
    id: 'oauth-env-key-prefix',
    value: 'oauth/kimi-code-env-<suffix>',
    evidence: 'packages/oauth/src/managed-kimi-code.ts',
    reason: 'Scoped OAuth keys for custom environments keep the kimi-code prefix.',
  },
  {
    id: 'build-define-prefix',
    value: '__KIMI_CODE_<NAME>',
    evidence: 'apps/kimi-code/tsdown.native.config.ts',
    reason: 'Build-time define names injected by tsdown keep the __KIMI_CODE_ prefix.',
  },
  {
    id: 'platform-value',
    value: 'kimi-code',
    evidence: 'apps/kimi-code/src/tui/components/dialogs/platform-selector.ts',
    reason: 'Login platform id returned by the /login selector.',
  },
  {
    id: 'platform-global-value',
    value: 'kimi-code-global',
    evidence: 'apps/kimi-code/src/utils/region.ts',
    reason: 'Global-region login platform id.',
  },
  {
    id: 'vscode-extension-id',
    value: 'moonshot-ai.kimi-code',
    evidence: 'apps/vscode/package.json',
    reason: 'Marketplace extension id that installed clients and settings already use.',
  },
  {
    id: 'npm-package',
    value: '@moonshot-ai/kimi-code',
    evidence: 'apps/kimi-code/src/constant/app.ts',
    reason: 'Published npm package name; the executable name is separate.',
  },
  {
    id: 'npm-sdk-package',
    value: '@moonshot-ai/kimi-code-sdk',
    evidence: 'packages/node-sdk/package.json',
    reason: 'Published SDK package name imported by external consumers.',
  },
  {
    id: 'artifact-name',
    value: 'kimi-code-<target>',
    evidence: 'apps/kimi-code/scripts/native/package.mjs',
    reason: 'Native archive, manifest, and CDN binary names consumed by install scripts.',
  },
  {
    id: 'log-file',
    value: 'logs/kimi-code.log',
    evidence: 'packages/agent-core-v2/src/app/sessionExport/sessionExportService.ts',
    reason: 'Session and global log file names read by exporters and support tooling.',
  },
  {
    id: 'user-agent-product',
    value: 'kimi-code-cli',
    evidence: 'apps/kimi-code/src/constant/app.ts',
    reason: 'HTTP User-Agent product token and telemetry app name.',
  },
  {
    id: 'telemetry-platform',
    value: 'kimi_code_cli',
    evidence: 'apps/kimi-code/src/constant/app.ts',
    reason: 'Telemetry platform token kept stable for dashboard queries.',
  },
  {
    id: 'wire-bearer-prefix',
    value: 'kimi-code.bearer.',
    evidence: 'packages/kap-server/src/transport/ws/bearerProtocol.ts',
    reason: 'WebSocket bearer subprotocol name negotiated with existing clients.',
  },
  {
    id: 'model-id',
    value: 'kimi-for-coding',
    evidence: 'packages/acp-server/src/model-catalog.ts',
    reason: 'Managed model id resolved from the platform catalog.',
  },
  {
    id: 'cdn-base',
    value: 'https://code.kimi.com/kimi-code',
    evidence: 'packages/oauth/src/region.ts',
    reason: 'CDN base for update manifests and native install scripts.',
  },
  {
    id: 'github-repo',
    value: 'MoonshotAI/kimi-code',
    evidence: 'apps/kimi-code/package.json',
    reason: 'Upstream repository URL referenced by package metadata and docs.',
  },
  {
    id: 'migration-marker',
    value: '.migrated-to-kimi-code',
    evidence: 'packages/migration-legacy/src/paths.ts',
    reason: 'Marker written by the legacy migration and read on later runs.',
  },
];

export const OVER_RENAME_RULES = [
  {
    id: 'product-name-mix',
    pattern: /\bKiko Code\b/g,
    reason: 'The product is Kiko; Kimi Code is the platform name.',
  },
  {
    id: 'platform-oauth',
    pattern: /\bKiko OAuth\b/g,
    reason: 'OAuth belongs to the Kimi Code platform identity.',
  },
  {
    id: 'platform-account-plan',
    pattern: /\bKiko (?:accounts?|plans?|subscriptions?)\b/g,
    reason: 'Accounts, plans, and subscriptions belong to the Kimi Code platform.',
  },
  {
    id: 'platform-console',
    pattern: /\bKiko (?:platform|console)\b/g,
    reason: 'The platform and console are Kimi Code identities.',
  },
  {
    id: 'platform-service',
    pattern: /\bKiko (?:managed service|service|managed endpoint|models? endpoint)\b/g,
    reason: 'The managed service keeps the Kimi Code name.',
  },
  {
    id: 'provider-key',
    pattern: /\bmanaged:kiko(?:-code)?\b/g,
    reason: 'The managed provider key must stay managed:kimi-code.',
  },
  {
    id: 'oauth-key',
    pattern: /\boauth\/kiko(?:-code)?(?:-env-[a-z0-9-]+)?\b/g,
    reason: 'The OAuth credential slot must stay oauth/kimi-code.',
  },
  {
    id: 'platform-global-value',
    pattern: /\bkiko(?:-code)?-global\b/g,
    reason: 'The global login platform id must stay kimi-code-global.',
  },
  {
    id: 'platform-env',
    pattern: /\bKIKO_CODE_[A-Z0-9_]+\b/g,
    reason: 'Kimi Code environment names keep the KIMI_CODE_ prefix; product variables use KIKO_.',
  },
  {
    id: 'build-define',
    pattern: /\b__KIKO_CODE_[A-Z0-9_]+\b/g,
    reason: 'Build-time defines keep the __KIMI_CODE_ prefix.',
  },
  {
    id: 'platform-property-value',
    pattern: /\b(?:name|label|value|platform)["']?\s*:\s*["']kiko(?:-code)?["']/g,
    reason: 'Platform ids and names stored as lowercase kiko values break stored config and manifests.',
  },
  {
    id: 'telemetry-property-value',
    pattern: /\b(?:owner|app)["']?\s*:\s*["']kiko(?:-code)?["']/gi,
    reason: 'Telemetry and notification identity must stay kimi-code.',
  },
  {
    id: 'platform-url-path',
    pattern: /\/kiko(?:-code)?\/plugins\//g,
    reason: 'The plugin marketplace path keeps the platform name.',
  },
  {
    id: 'npm-scope',
    pattern: /@moonshot-ai\/kiko\b/g,
    reason: 'Published package names keep the @moonshot-ai/kimi-code scope.',
  },
  {
    id: 'vscode-extension-id',
    pattern: /\bmoonshot-ai\.kiko(?:-code)?\b/g,
    reason: 'The marketplace extension id stays moonshot-ai.kimi-code.',
  },
  {
    id: 'vscode-contribution-id',
    pattern:
      /\bkiko\.(?:clearAllState|openInTab|openInSideBar|focusInput|insertMention|newConversation|showLogs|resetKimi|logout|migrateLegacyData|isLoggedIn|yoloMode|autosave|enableNewConversationShortcut|useCtrlEnterToSend|showThinkingContent|showThinkingExpanded|editorContext)\b|\bkiko-sidebar\b|\bkiko\.webview\b/g,
    reason: 'VS Code command, setting, context-key, and view ids stay compatible with existing installs.',
  },
  {
    id: 'github-repo',
    pattern: /\bMoonshotAI\/kiko(?:-code)?\b/g,
    reason: 'The upstream repository URL stays MoonshotAI/kimi-code.',
  },
  {
    id: 'artifact-name',
    pattern: /\bkiko-code(?:[-_.][a-zA-Z0-9._-]+)?\b/g,
    reason: 'Native artifact names stay kimi-code-<target>.',
  },
  {
    id: 'telemetry-name',
    pattern: /\bkiko-code-cli\b|\bkiko_code_cli\b|\bkiko-cli(?=['"]|\/\d)/g,
    reason: 'User-Agent and telemetry names stay kimi-code-cli / kimi_code_cli; the kiko-cli repository name is not a telemetry token.',
  },
  {
    id: 'log-name',
    pattern: /\bkiko(?:-code)?\.log\b/g,
    reason: 'Log file names stay kimi-code.log.',
  },
  {
    id: 'wire-protocol',
    pattern: /\bkiko(?:-code)?\.bearer\./g,
    reason: 'The WebSocket bearer subprotocol stays kimi-code.bearer.',
  },
  {
    id: 'model-id',
    pattern: /\bkiko-for-coding\b|\bkiko-k[0-9](?:\.[0-9]+)?\b/g,
    reason: 'Managed model ids stay in the kimi-* namespace.',
  },
  {
    id: 'cdn-url',
    pattern: /\bkiko\.(?:com|ai)\b|\/\/[^"'\s]*kimi[^"'\s]*\/kiko(?:-code)?(?:\/|["'\s])/g,
    reason: 'CDN, install, and console URLs stay on the kimi.com / kimi.ai hosts and /kimi-code path.',
  },
  {
    id: 'migration-marker',
    pattern: /\bmigrated-to-kiko(?:-code)?\b/g,
    reason: 'The legacy migration marker stays .migrated-to-kimi-code.',
  },
];

export const HISTORY_PATH_PATTERNS = [
  /(^|\/)CHANGELOG\.md$/i,
  /(^|\/)release-notes\//,
  /(^|\/)[^/]*migration[^/]*\.md$/i,
  /(^|\/)\.changeset\//,
];

export const TEST_PATH_PATTERNS = [
  /(^|\/)test\//,
  /(^|\/)__tests__\//,
  /\.test\.[cm]?[jt]sx?$/,
];

export const MANIFEST_PATH_PATTERNS = [
  /(^|\/)package\.json$/,
  /(^|\/)flake\.nix$/,
  /(^|\/)scripts\/native\//,
  /(^|\/)packages\/[^/]+\/README\.md$/,
];

export const SHARED_EXCLUDED_PATTERNS = [
  /(^|\/)node_modules\//,
  /(^|\/)\.git\//,
  /(^|\/)\.tower\//,
  /(^|\/)dist\//,
  /(^|\/)dist-web\//,
  /(^|\/)coverage\//,
  /(^|\/)scripts\/kiko-sync\//,
  /(^|\/)\.agents\//,
  /(^|\/)AGENTS\.md$/,
  /(^|\/)CLAUDE\.md$/,
];

export const APPLY_EXCLUDED_PATTERNS = [...SHARED_EXCLUDED_PATTERNS, /(^|\/)\.github\//];

export const CHECK_EXCLUDED_PATTERNS = [
  ...SHARED_EXCLUDED_PATTERNS,
  ...TEST_PATH_PATTERNS,
  /(^|\/)pnpm-lock\.yaml$/,
];

export const DEFAULT_COPY_SURFACES = [
  'apps/kimi-code/src',
  'packages',
  'docs/en',
  'docs/zh',
  'flake.nix',
  'README.md',
  'README.zh-CN.md',
  'SECURITY.md',
];

export const DEFAULT_IDENTITY_ROOTS = [
  'apps',
  'packages',
  'scripts/native',
  '.github/workflows',
  'flake.nix',
  'docs/en',
  'docs/zh',
  'README.md',
  'README.zh-CN.md',
  'SECURITY.md',
];

export const SCRIPT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
]);

export const COPY_EXTENSIONS = new Set([...SCRIPT_EXTENSIONS, '.md', '.mdx', '.json', '.nix']);

export const IDENTITY_EXTENSIONS = new Set([
  ...COPY_EXTENSIONS,
  '.json',
  '.nix',
  '.yml',
  '.yaml',
  '.toml',
]);