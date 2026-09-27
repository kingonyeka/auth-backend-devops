import type { Request, Response } from 'express';
import * as authService from './auth.service';
import { signupSchema, loginSchema, verifyEmailSchema, refreshSchema } from './auth.types';

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

export async function loginHandler(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const { user, tokens } = await authService.login(input);

  // Refresh token goes in an httpOnly cookie — inaccessible to JS, which
  // mitigates XSS-based token theft. Access token goes in the response
  // body — the frontend keeps it in memory and attaches it as a Bearer header.
  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(200).json({ user, accessToken: tokens.accessToken });
}

export async function refreshHandler(req: Request, res: Response) {
  const refreshToken = req.cookies?.refreshToken;
  const input = refreshSchema.parse({ refreshToken });

  const tokens = await authService.refresh(input.refreshToken);

  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(200).json({ accessToken: tokens.accessToken });
}

export async function logoutHandler(req: Request, res: Response) {
  const refreshToken = req.cookies?.refreshToken;
  if (refreshToken) {
    await authService.logout(refreshToken);
  }
  res.clearCookie('refreshToken');
  res.status(204).send();
}