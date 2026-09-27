import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().default(5),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('debug'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Throw instead of process.exit() — exiting the process is correct for a
  // real running server (fail fast, loud, and immediately) but it also
  // kills the entire Jest worker if this file is imported during tests,
  // silently aborting every other test in the run. Throwing lets the
  // caller (server.ts in production, Jest in tests) decide what to do.
  throw new Error(
    `Invalid environment variables: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
  );
}

export const env = parsed.data;
