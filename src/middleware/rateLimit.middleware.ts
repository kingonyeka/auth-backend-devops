import rateLimit from 'express-rate-limit';
import { env } from '../config';

export const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
  // Rate limiting is real, correct behavior in dev/staging/prod — but a
  // single test file legitimately makes many rapid requests to exercise
  // different code paths. Skipping it under NODE_ENV=test avoids testing
  // "does my rate limiter work" (a separate concern) every time we're
  // actually testing "does my auth logic work".
  skip: () => env.NODE_ENV === 'test',
});