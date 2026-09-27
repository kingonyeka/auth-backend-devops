import { PrismaClient } from '@prisma/client';
import { env } from '../../config';

// Prevent multiple PrismaClient instances during dev hot-reloads (ts-node-dev
// restarts the process but can leave old connections dangling otherwise).
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (env.NODE_ENV === 'development') {
  global.__prisma = prisma;
}