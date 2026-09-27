import './config'; // load + validate env FIRST, before anything else touches it
import { createApp } from './app';
import { env } from './config';
import { logger } from './utils/logger';
import { prisma } from './lib/db/prisma';
import { redis } from './lib/redis/client';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 Server listening on port ${env.PORT} [${env.NODE_ENV}]`);
});

// Graceful shutdown — important once this runs in a container/ECS, where
// AWS sends SIGTERM before killing the process during deploys/scaling.
// Without this, in-flight requests get dropped mid-response.
async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully`);
  server.close(async () => {
    await prisma.$disconnect();
    redis.disconnect();
    logger.info('Shutdown complete');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));