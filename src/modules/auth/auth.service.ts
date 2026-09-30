import { hashPassword, verifyPassword } from '../../utils/hash';
import { logger } from '../../utils/logger';
import { AppError } from '../../middleware/errorHandler.middleware';
import {
  createUser,
  findUserByEmail,
  findUserById,
  markEmailVerified,
  toPublicUser,
  updatePassword,
} from '../users/users.service';
import {
  acquireCooldown,
  consumePasswordResetToken,
  createPasswordResetToken,
  createVerificationCode,
  sendPasswordResetEmail,
  sendVerificationEmail,
  verifyCode,
} from '../verification/verification.service';
import {
  issueTokenPair,
  revokeAllUserTokens,
  revokeRefreshToken,
  rotateRefreshToken,
} from '../tokens/tokens.service';
import type { LoginInput, SignupInput } from './auth.types';

// Computed once at startup. Used in login() so that "no such user" costs the
// same time as "wrong password" (see the comment there).
const dummyHashPromise = hashPassword('not-a-real-password');

async function issueAndSendVerificationCode(email: string): Promise<void> {
  const code = await createVerificationCode(email);
  await sendVerificationEmail(email, code);
}

export async function signup(input: SignupInput) {
  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw new AppError(409, 'An account with this email already exists');
  }

  const passwordHash = await hashPassword(input.password);
  const user = await createUser(input.email, passwordHash);

  // The account exists now. If the broker is down, don't fail the whole signup
  // (the user would retry and hit "already exists"). Log it; they can use
  // /auth/resend-verification.
  try {
    await issueAndSendVerificationCode(user.email);
  } catch (err) {
    logger.error({ err }, 'Failed to enqueue verification email');
  }

  return toPublicUser(user);
}

export async function verifyEmail(email: string, code: string) {
  const isValid = await verifyCode(email, code);
  if (!isValid) {
    throw new AppError(400, 'Invalid or expired verification code');
  }

  const user = await findUserByEmail(email);
  if (!user) {
    throw new AppError(404, 'User not found');
  }

  const updated = await markEmailVerified(user.id);
  return toPublicUser(updated);
}

export async function resendVerification(email: string): Promise<void> {
  const allowed = await acquireCooldown('resend_verification', email);
  if (!allowed) {
    throw new AppError(429, 'Please wait a minute before requesting another code');
  }

  const user = await findUserByEmail(email);
  // Unknown or already verified: do nothing, and the caller still gets the same
  // generic 200, so this endpoint can't be used to discover registered emails.
  if (!user || user.emailVerified) return;

  await issueAndSendVerificationCode(user.email);
}

export async function login(input: LoginInput) {
  const user = await findUserByEmail(input.email);
  const invalidCredentialsError = new AppError(401, 'Invalid email or password');

  if (!user) {
    // Burn the same argon2 time as a real check. Otherwise "unknown email"
    // returns measurably faster than "wrong password" and leaks which emails exist.
    await verifyPassword(await dummyHashPromise, input.password);
    throw invalidCredentialsError;
  }

  const passwordValid = await verifyPassword(user.passwordHash, input.password);
  if (!passwordValid) throw invalidCredentialsError;

  if (!user.emailVerified) {
    throw new AppError(403, 'Please verify your email before logging in');
  }

  const tokens = await issueTokenPair(user.id, user.email);
  return { user: toPublicUser(user), tokens };
}

export async function refresh(refreshToken: string) {
  const userId = await rotateRefreshToken(refreshToken);
  if (!userId) {
    throw new AppError(401, 'Invalid or expired refresh token');
  }

  const user = await findUserById(userId);
  if (!user) throw new AppError(401, 'User no longer exists');

  return issueTokenPair(user.id, user.email);
}

export async function logout(refreshToken: string) {
  await revokeRefreshToken(refreshToken);
}

export async function getCurrentUser(userId: string) {
  const user = await findUserById(userId);
  if (!user) throw new AppError(404, 'User not found');
  return toPublicUser(user);
}

export async function forgotPassword(email: string): Promise<void> {
  const allowed = await acquireCooldown('forgot_password', email);
  if (!allowed) {
    throw new AppError(429, 'Please wait a minute before requesting another reset email');
  }

  const user = await findUserByEmail(email);
  if (!user) return; // silent, same generic response as the success case

  const token = await createPasswordResetToken(user.id);
  await sendPasswordResetEmail(user.email, token);
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const userId = await consumePasswordResetToken(token);
  if (!userId) {
    throw new AppError(400, 'Invalid or expired reset token');
  }

  const user = await findUserById(userId);
  if (!user) {
    throw new AppError(400, 'Invalid or expired reset token');
  }

  const passwordHash = await hashPassword(newPassword);
  await updatePassword(user.id, passwordHash);

  // Whoever knew the old password (possibly an attacker) is now logged out everywhere.
  await revokeAllUserTokens(user.id);
}