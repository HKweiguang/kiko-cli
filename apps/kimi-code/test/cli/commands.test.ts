import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const appRoot = resolve(import.meta.dirname, '../..');

describe('CLI command identity', () => {
  it('defines kiko as the runtime command name', async () => {
    const source = await readFile(resolve(appRoot, 'src/constant/app.ts'), 'utf-8');

    expect(source).toMatch(/CLI_COMMAND_NAME\s*=\s*'kiko'/);
  });
});
