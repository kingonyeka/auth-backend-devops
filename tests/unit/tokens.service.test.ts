jest.mock('../../src/lib/redis/client', () => ({
  redis: {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  },
}));

import { issueTokenPair } from '../../src/modules/tokens/tokens.service';
import { redis } from '../../src/lib/redis/client';
import jwt from 'jsonwebtoken';

describe('tokens.service — issueTokenPair', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('issues a valid, decodable access token', async () => {
    const tokens = await issueTokenPair('user-123', 'test@example.com');
    const decoded = jwt.decode(tokens.accessToken) as { sub: string; email: string };

    expect(decoded.sub).toBe('user-123');
    expect(decoded.email).toBe('test@example.com');
  });

  it('stores the refresh token in Redis with an expiry', async () => {
    await issueTokenPair('user-123', 'test@example.com');

    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining('refresh_token:'),
      'user-123',
      'EX',
      expect.any(Number),
    );
  });

  it('generates a different refresh token on every call', async () => {
    const first = await issueTokenPair('user-123', 'test@example.com');
    const second = await issueTokenPair('user-123', 'test@example.com');

    expect(first.refreshToken).not.toBe(second.refreshToken);
  });
});