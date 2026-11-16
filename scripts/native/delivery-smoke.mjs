import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { executableName } from '../../apps/kimi-code/scripts/native/paths.mjs';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const flake = await readFile(resolve(repoRoot, 'flake.nix'), 'utf-8');
const packageScript = await readFile(
  resolve(repoRoot, 'apps/kimi-code/scripts/native/package.mjs'),
  'utf-8',
);
const manifestScript = await readFile(
  resolve(repoRoot, 'apps/kimi-code/scripts/native/produce-manifest.mjs'),
  'utf-8',
);

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

assert(executableName('win32') === 'kiko.exe', 'Windows native executable must be kiko.exe');
assert(executableName('darwin') === 'kiko', 'macOS native executable must be kiko');
assert(executableName('linux') === 'kiko', 'Linux native executable must be kiko');
assert(
  packageScript.includes('`kimi-code-${target}.zip`'),
  'Native archive artifact names must remain kimi-code-<target>.zip',
);
assert(
  manifestScript.includes("? 'kiko.exe' : 'kiko'"),
  'Native release manifest must expect kiko/kiko.exe in archives',
);
assert(
  manifestScript.includes('`kimi-code-${target}`'),
  'Native manifest binary artifact names must remain kimi-code-<target>',
);
assert(
  flake.includes('"apps/kimi-code/dist-native/bin/${nativeTarget}/kiko"'),
  'Nix must install the kiko native executable',
);
assert(flake.includes('"$out/bin/kiko"'), 'Nix must install the command as kiko');
assert(flake.includes('wrapProgram $out/bin/kiko '), 'Nix must wrap the kiko command');
assert(flake.includes('mainProgram = "kiko";'), 'Nix mainProgram must be kiko');
assert(flake.includes('}/bin/kiko";'), 'Nix app target must execute kiko');
assert(!flake.includes('"$out/bin/kimi"'), 'Nix must not install a kimi command');

console.log('Native and Nix delivery smoke passed');
