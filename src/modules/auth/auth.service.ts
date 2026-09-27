import { hashPassword, verifyPassword } from '../../utils/hash';
import { createUser, findUserByEmail, findUserById, markEmailVerified, toPublicUser } from '../users/users.service';
import { createVerificationCode, sendVerificationEmail, verifyCode } from '../verification/verification.service';
import { issueTokenPair, rotateRefreshToken, revokeRefreshToken } from '../tokens/tokens.service';
import { AppError } from '../../middleware/errorHandler.middleware';
import type { SignupInput, LoginInput } from './auth.types';

export async function signup(input: SignupInput) {
  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw new AppError(409, 'An account with this email already exists');
  }

  const passwordHash = await hashPassword(input.password);
  const user = await createUser(input.email, passwordHash);

  const code = await createVerificationCode(user.email);
  await sendVerificationEmail(user.email, code);

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

export async function login(input: LoginInput) {
  const user = await findUserByEmail(input.email);

  // Deliberately identical error for "no such user" and "wrong password" —
  // returning a different message for each lets an attacker enumerate
  // which emails are registered. This is a real, commonly-tested security detail.
  const invalidCredentialsError = new AppError(401, 'Invalid email or password');

  if (!user) throw invalidCredentialsError;

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