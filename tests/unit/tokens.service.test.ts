jest.mock('../../src/lib/redis/client', () => ({
  redis: {
    set: jest.fn(),
    get: jest.fn(),
    getdel: jest.fn(),
    del: jest.fn(),
    sadd: jest.fn(),
    srem: jest.fn(),
    expire: jest.fn(),
    smembers: jest.fn(),
  },
}));

import jwt from 'jsonwebtoken';
import { redis } from '../../src/lib/redis/client';
import {
  issueTokenPair,
  revokeAllUserTokens,
  rotateRefreshToken,
} from '../../src/modules/tokens/tokens.service';

describe('tokens.service', () => {
  describe('issueTokenPair', () => {
    it('issues a valid, decodable access token', async () => {
      const tokens = await issueTokenPair('user-123', 'test@example.com');
      const decoded = jwt.decode(tokens.accessToken) as { sub: string; email: string };

      expect(decoded.sub).toBe('user-123');
      expect(decoded.email).toBe('test@example.com');
    });

    it('gives every access token a unique jti, even when issued in the same second', async () => {
      const first = await issueTokenPair('user-123', 'test@example.com');
      const second = await issueTokenPair('user-123', 'test@example.com');

      const a = jwt.decode(first.accessToken) as { jti: string };
      const b = jwt.decode(second.accessToken) as { jti: string };

      expect(a.jti).toBeDefined();
      expect(a.jti).not.toBe(b.jti);
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

    it("registers the refresh token in the user's session set", async () => {
      const { refreshToken } = await issueTokenPair('user-123', 'test@example.com');

      expect(redis.sadd).toHaveBeenCalledWith('user_sessions:user-123', refreshToken);
      expect(redis.expire).toHaveBeenCalledWith('user_sessions:user-123', expect.any(Number));
    });

    it('generates a different refresh token on every call', async () => {
      const first = await issueTokenPair('user-123', 'test@example.com');
      const second = await issueTokenPair('user-123', 'test@example.com');

      expect(first.refreshToken).not.toBe(second.refreshToken);
    });
  });

  describe('rotateRefreshToken', () => {
    it('returns null for an unknown or already-used token', async () => {
      (redis.getdel as jest.Mock).mockResolvedValueOnce(null);

      const result = await rotateRefreshToken('unknown-token');

      expect(result).toBeNull();
      expect(redis.srem).not.toHaveBeenCalled();
    });

    it('returns the userId and removes the token from the session set', async () => {
      (redis.getdel as jest.Mock).mockResolvedValueOnce('user-123');

      const result = await rotateRefreshToken('old-token');

      expect(result).toBe('user-123');
      expect(redis.srem).toHaveBeenCalledWith('user_sessions:user-123', 'old-token');
    });
  });

  describe('revokeAllUserTokens', () => {
    it('deletes every live refresh token and the session set itself', async () => {
      (redis.smembers as jest.Mock).mockResolvedValueOnce(['token-a', 'token-b']);

      await revokeAllUserTokens('user-123');

      expect(redis.del).toHaveBeenCalledWith('refresh_token:token-a', 'refresh_token:token-b');
      expect(redis.del).toHaveBeenCalledWith('user_sessions:user-123');
    });

    it('handles a user with no active sessions', async () => {
      (redis.smembers as jest.Mock).mockResolvedValueOnce([]);

      await revokeAllUserTokens('user-123');

      expect(redis.del).toHaveBeenCalledTimes(1);
      expect(redis.del).toHaveBeenCalledWith('user_sessions:user-123');
    });
  });
});