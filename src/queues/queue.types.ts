import { z } from 'zod';

// A discriminated union: every job carries a `type`, and TypeScript narrows
// the remaining fields based on it. Adding a new email kind later means adding
// one entry here, and the compiler tells you everywhere that needs handling it.
export const emailJobSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('verification'), to: z.string().email(), code: z.string() }),
  z.object({ type: z.literal('password_reset'), to: z.string().email(), token: z.string() }),
]);

export type EmailJob = z.infer<typeof emailJobSchema>;
