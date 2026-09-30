import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config';
import { AppError } from '../../middleware/errorHandler.middleware';
import { refreshTokenTtlSeconds } from '../tokens/tokens.service';
import * as authService from './auth.service';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
} from './auth.types';

const REFRESH_COOKIE = 'refreshToken';

// Path-scoped: the browser only attaches this cookie to /auth/* requests,
// not to every call the frontend makes. clearCookie must use the same options.
const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/auth',
};

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    ...baseCookieOptions,
    maxAge: refreshTokenTtlSeconds() * 1000, // stays in sync with JWT_REFRESH_EXPIRY
  });
}

export async function signupHandler(req: Request, res: Response) {
  const input = signupSchema.parse(req.body);
  const user = await authService.signup(input);
  res.status(201).json({ user });
}

export async function verifyEmailHandler(req: Request, res: Response) {
  const input = verifyEmailSchema.parse(req.body);
  const user = await authService.verifyEmail(input.email, input.code);
  res.status(200).json({ user });
}

export async function resendVerificationHandler(req: Request, res: Response) {
  const { email } = resendVerificationSchema.parse(req.body);
  await authService.resendVerification(email);
  res.status(200).json({
    message: 'If that account exists and is unverified, a new code has been sent.',
  });
}

export async function loginHandler(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const { user, tokens } = await authService.login(input);

  setRefreshCookie(res, tokens.refreshToken);
  res.status(200).json({ user, accessToken: tokens.accessToken });
}

export async function refreshHandler(req: Request, res: Response) {
  const input = refreshSchema.parse({ refreshToken: req.cookies?.[REFRESH_COOKIE] });
  const tokens = await authService.refresh(input.refreshToken);

  setRefreshCookie(res, tokens.refreshToken);
  res.status(200).json({ accessToken: tokens.accessToken });
}

export async function logoutHandler(req: Request, res: Response) {
  const refreshToken = req.cookies?.[REFRESH_COOKIE];
  if (refreshToken) {
    await authService.logout(refreshToken);
  }
  res.clearCookie(REFRESH_COOKIE, baseCookieOptions);
  res.status(204).send();
}

export async function meHandler(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Not authenticated');

  const user = await authService.getCurrentUser(userId);
  res.status(200).json({ user });
}

export async function forgotPasswordHandler(req: Request, res: Response) {
  const { email } = forgotPasswordSchema.parse(req.body);
  await authService.forgotPassword(email);
  res.status(200).json({
    message: 'If an account exists for that email, a reset link has been sent.',
  });
}

export async function resetPasswordHandler(req: Request, res: Response) {
  const { token, newPassword } = resetPasswordSchema.parse(req.body);
  await authService.resetPassword(token, newPassword);
  res.status(200).json({ message: 'Password updated. Please log in with your new password.' });
}