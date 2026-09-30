import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { redis } from '../../lib/redis/client';
import { AppError } from '../../middleware/errorHandler.middleware';
import { publishEmailJob } from '../../queues/producers/email.producer';

const VERIFICATION_PREFIX = 'email_verification:';
const VERIFICATION_ATTEMPTS_PREFIX = 'verify_attempts:';
const PASSWORD_RESET_PREFIX = 'password_reset:';
const COOLDOWN_PREFIX = 'cooldown:';

const CODE_TTL_SECONDS = 15 * 60;
const PASSWORD_RESET_TTL_SECONDS = 15 * 60;
const MAX_VERIFY_ATTEMPTS = 5;

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ---------- Email verification codes ----------

export async function createVerificationCode(email: string): Promise<string> {
  // randomInt's upper bound is exclusive: 1_000_000 gives the full 6-digit range.
  const code = randomInt(100000, 1000000).toString();
  await redis.set(`${VERIFICATION_PREFIX}${email}`, code, 'EX', CODE_TTL_SECONDS);
  // A fresh code gets fresh attempts. Repeated resends are bounded by the cooldown.
  await redis.del(`${VERIFICATION_ATTEMPTS_PREFIX}${email}`);
  return code;
}

export async function verifyCode(email: string, code: string): Promise<boolean> {
  const codeKey = `${VERIFICATION_PREFIX}${email}`;
  const attemptsKey = `${VERIFICATION_ATTEMPTS_PREFIX}${email}`;

  // A 6-digit code has only 1,000,000 possibilities, so without an attempt
  // limit it can be brute-forced. Count every try and burn the code after 5.
  const attempts = await redis.incr(attemptsKey);
  if (attempts === 1) await redis.expire(attemptsKey, CODE_TTL_SECONDS);

  if (attempts > MAX_VERIFY_ATTEMPTS) {
    await redis.del(codeKey);
    throw new AppError(429, 'Too many failed attempts. Please request a new code.');
  }

  const storedCode = await redis.get(codeKey);
  if (!storedCode || !safeEqual(storedCode, code)) return false;

  await redis.del(codeKey, attemptsKey); // one-time use
  return true;
}

// ---------- Password reset tokens ----------

export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  // Store only a HASH of the token. If Redis contents ever leak, the attacker
  // gets hashes, not usable reset links. Same idea as hashing passwords.
  await redis.set(
    `${PASSWORD_RESET_PREFIX}${hashToken(token)}`,
    userId,
    'EX',
    PASSWORD_RESET_TTL_SECONDS,
  );
  return token;
}

// Atomic single-use: returns the userId and deletes the token in one step.
export async function consumePasswordResetToken(token: string): Promise<string | null> {
  return redis.getdel(`${PASSWORD_RESET_PREFIX}${hashToken(token)}`);
}

// ---------- Anti-abuse ----------

// True if this caller may proceed, false if still cooling down. SET ... NX is
// atomic, so two simultaneous requests can't both win. We key on the email
// whether or not it exists, so responses never reveal which emails are registered.
export async function acquireCooldown(
  scope: string,
  email: string,
  seconds = 60,
): Promise<boolean> {
  const result = await redis.set(`${COOLDOWN_PREFIX}${scope}:${email}`, '1', 'EX', seconds, 'NX');
  return result === 'OK';
}

// ---------- Delivery (now via the queue instead of a console.log stub) ----------

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  await publishEmailJob({ type: 'verification', to: email, code });
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  await publishEmailJob({ type: 'password_reset', to: email, token });
}
