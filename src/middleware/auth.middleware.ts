import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config';
import { AppError } from './errorHandler.middleware';

interface AccessTokenPayload {
  sub: string; // user id
  email: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(401, 'Missing or malformed authorization header');
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    throw new AppError(401, 'Invalid or expired access token');
  }
}
