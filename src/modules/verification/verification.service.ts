import { randomInt } from 'crypto';
import { redis } from '../../lib/redis/client';
import { logger } from '../../utils/logger';

const VERIFICATION_PREFIX = 'email_verification:';
const VERIFICATION_TTL_SECONDS = 15 * 60; // 15 minutes

export async function createVerificationCode(email: string): Promise<string> {
  // 6-digit numeric code — simpler for users to type than a long token,
  // standard pattern for email/SMS verification.
  const code = randomInt(100000, 999999).toString();
  await redis.set(`${VERIFICATION_PREFIX}${email}`, code, 'EX', VERIFICATION_TTL_SECONDS);
  return code;
}

export async function verifyCode(email: string, code: string): Promise<boolean> {
  const key = `${VERIFICATION_PREFIX}${email}`;
  const storedCode = await redis.get(key);

  if (!storedCode || storedCode !== code) return false;

  await redis.del(key); // one-time use
  return true;
}

// STUB: replace this with the real SQS producer once Phase 6 (messaging)
// is built. For now, this lets you develop and test the full signup flow
// without needing SES/Twilio configured.
export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  logger.info(`📧 [DEV STUB] Verification code for ${email}: ${code}`);
}