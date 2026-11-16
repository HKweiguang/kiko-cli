import { describe, expect, it } from 'vitest';

import { createProgram } from '#/cli/commands';

describe('CLI command identity', () => {
  it('renders help with kiko as the command name', () => {
    const program = createProgram('0.0.0-test', () => {}, () => {});

    expect(program.helpInformation()).toContain('Usage: kiko [options] [command]');
  });
});
