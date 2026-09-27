import { z } from 'zod';

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const verifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
