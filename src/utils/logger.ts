import pino from 'pino';
import { env } from '../config';

export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.passwordHash'],
});
