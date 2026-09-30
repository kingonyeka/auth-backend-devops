import { z } from 'zod';

// Normalize once, at the boundary: "Lee@X.com" and "lee@x.com" must be the
// same account. Everything downstream can then trust emails are canonical.
const email = z.string().trim().toLowerCase().email();

// Cap the length: hashing a multi-megabyte "password" is a cheap DoS vector.
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const signupSchema = z.object({ email, password });

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

export const verifyEmailSchema = z.object({
  email,
  code: z.string().length(6),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const resendVerificationSchema = z.object({ email });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: password,
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
