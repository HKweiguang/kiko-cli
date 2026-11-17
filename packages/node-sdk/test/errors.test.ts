import { describe, expect, it } from 'vitest';

import { ErrorCodes, KIMI_ERROR_INFO } from '#/index';

describe('KIMI_ERROR_INFO', () => {
  it('names Kiko in the wire upgrade guidance', () => {
    expect(KIMI_ERROR_INFO[ErrorCodes.WIRE_VERSION_TOO_LOW]).toMatchObject({
      title: 'Kiko upgrade required',
      action: 'Upgrade Kiko to the latest version to read this session.',
    });
  });
});