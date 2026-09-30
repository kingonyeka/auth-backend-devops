import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { env } from '../../config';
import { redis } from '../../lib/redis/client';
import type { TokenPair } from './tokens.types';

const REFRESH_TOKEN_PREFIX = 'refresh_token:';
const USER_SESSIONS_PREFIX = 'user_sessions:';

export function refreshTokenTtlSeconds(): number {
  const FALLBACK_SECONDS = 7 * 24 * 60 * 60; // 7 days
  const match = env.JWT_REFRESH_EXPIRY.match(/^(\d+)([smhd])$/);
  if (!match) return FALLBACK_SECONDS;

  const [, value, unit] = match;
  if (!value || !unit) return FALLBACK_SECONDS;

  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  const multiplier = multipliers[unit];
  if (multiplier === undefined) return FALLBACK_SECONDS;

  return Number(value) * multiplier;
}

export async function issueTokenPair(userId: string, email: string): Promise<TokenPair> {
  const accessToken = jwt.sign(
    { sub: userId, email, jti: randomUUID() },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRY } as jwt.SignOptions,
  );

  const refreshToken = randomUUID();
  const ttl = refreshTokenTtlSeconds();
  const sessionsKey = `${USER_SESSIONS_PREFIX}${userId}`;

  await redis.set(`${REFRESH_TOKEN_PREFIX}${refreshToken}`, userId, 'EX', ttl);

  // Per-user index of live refresh tokens. Without it, "log this user out of
  // every device" (needed on password reset) would mean scanning all of Redis.
  await redis.sadd(sessionsKey, refreshToken);
  await redis.expire(sessionsKey, ttl);

  return { accessToken, refreshToken };
}

export async function rotateRefreshToken(oldRefreshToken: string): Promise<string | null> {
  // GETDEL is atomic: read-and-delete in one step. With separate GET then DEL,
  // two simultaneous requests could both "use" the same single-use token.
  const userId = await redis.getdel(`${REFRESH_TOKEN_PREFIX}${oldRefreshToken}`);
  if (!userId) return null;

  await redis.srem(`${USER_SESSIONS_PREFIX}${userId}`, oldRefreshToken);
  return userId;
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const userId = await redis.getdel(`${REFRESH_TOKEN_PREFIX}${refreshToken}`);
  if (userId) {
    await redis.srem(`${USER_SESSIONS_PREFIX}${userId}`, refreshToken);
  }
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  const sessionsKey = `${USER_SESSIONS_PREFIX}${userId}`;
  const tokens = await redis.smembers(sessionsKey);

  if (tokens.length > 0) {
    await redis.del(...tokens.map((t) => `${REFRESH_TOKEN_PREFIX}${t}`));
  }
  await redis.del(sessionsKey);
}