import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { logger } from './utils/logger';
import { requestId } from './middleware/requestId.middleware';
import { errorHandler } from './middleware/errorHandler.middleware';
import authRoutes from './modules/auth/auth.routes';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.APP_URL, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(requestId);
  app.use(pinoHttp({ logger }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/auth', authRoutes);

  // Error handler MUST be registered last — Express identifies error-handling
  // middleware by its 4-argument signature and only reaches it after every
  // other route/middleware has run.
  app.use(errorHandler);

  return app;
}
