import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { env } from '../../config';
import { redis } from '../../lib/redis/client';
import type { TokenPair } from './tokens.types';

const REFRESH_TOKEN_PREFIX = 'refresh_token:';

function refreshTokenTtlSeconds(): number {
  const FALLBACK_SECONDS = 7 * 24 * 60 * 60; // 7 days
  const match = env.JWT_REFRESH_EXPIRY.match(/^(\d+)([smhd])$/);

  if (!match) return FALLBACK_SECONDS;

  const [, value, unit] = match;

  // Under noUncheckedIndexedAccess, destructured regex groups are typed as
  // `string | undefined` even though our regex guarantees they exist here.
  // Guard explicitly rather than fighting the type checker with `!`.
  if (!value || !unit) return FALLBACK_SECONDS;

  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  const multiplier = multipliers[unit];

  if (multiplier === undefined) return FALLBACK_SECONDS;

  return Number(value) * multiplier;
}

export async function issueTokenPair(userId: string, email: string): Promise<TokenPair> {
  const accessToken = jwt.sign({ sub: userId, email, jti: randomUUID() }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY,
  } as jwt.SignOptions);

  // A random, opaque refresh token — NOT a JWT. We store it server-side in
  // Redis so it can be revoked instantly (logout, password change, suspected
  // theft). A self-contained JWT refresh token can't be revoked before it
  // naturally expires, which is a real security gap for a token that lives 7 days.
  const refreshToken = randomUUID();
  await redis.set(`${REFRESH_TOKEN_PREFIX}${refreshToken}`, userId, 'EX', refreshTokenTtlSeconds());

  return { accessToken, refreshToken };
}

export async function rotateRefreshToken(oldRefreshToken: string): Promise<string | null> {
  const key = `${REFRESH_TOKEN_PREFIX}${oldRefreshToken}`;
  const userId = await redis.get(key);

  if (!userId) return null;

  // Rotation: delete the old token, issue a new one. If a stolen refresh
  // token is ever reused after the legitimate user has already rotated it,
  // this pattern lets you detect and respond to that (out of scope for now,
  // but this is WHY rotation matters, not just token expiry).
  await redis.del(key);
  return userId;
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await redis.del(`${REFRESH_TOKEN_PREFIX}${refreshToken}`);
}
