import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/db/prisma';
import { redis } from '../../src/lib/redis/client';
import { publishEmailJob } from '../../src/queues/producers/email.producer';

// API tests don't need a real broker: swap the producer for a mock and assert
// on what WOULD have been published. The queue mechanics are covered by the
// consumer unit tests.
jest.mock('../../src/queues/producers/email.producer', () => ({
  publishEmailJob: jest.fn().mockResolvedValue(undefined),
}));

const publishMock = publishEmailJob as jest.MockedFunction<typeof publishEmailJob>;
const app = createApp();

const testUser = { email: 'jest-test-user@example.com', password: 'password123' };
const unknownEmail = 'jest-nobody@example.com';
const newPassword = 'newPassword456';

async function clearTestState() {
  await prisma.user.deleteMany({ where: { email: testUser.email } });
  await redis.del(
    `email_verification:${testUser.email}`,
    `verify_attempts:${testUser.email}`,
    `cooldown:resend_verification:${testUser.email}`,
    `cooldown:forgot_password:${testUser.email}`,
    `cooldown:resend_verification:${unknownEmail}`,
    `cooldown:forgot_password:${unknownEmail}`,
  );
}

async function getVerificationCode(email: string): Promise<string> {
  const code = await redis.get(`email_verification:${email}`);
  if (!code) throw new Error(`No verification code found in Redis for ${email}`);
  return code;
}

beforeAll(clearTestState);

afterAll(async () => {
  await clearTestState();
  await prisma.$disconnect();
  redis.disconnect();
});

describe('Auth flow', () => {
  let verificationCode: string;
  let accessToken: string;
  let refreshCookie: string;

  it('signs up a new user and enqueues a verification email', async () => {
    const res = await request(app).post('/auth/signup').send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user.emailVerified).toBe(false);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(publishMock).toHaveBeenCalledWith({
      type: 'verification',
      to: testUser.email,
      code: expect.any(String),
    });
  });

  it('rejects a duplicate signup with the same email', async () => {
    const res = await request(app).post('/auth/signup').send(testUser);
    expect(res.status).toBe(409);
  });

  it('treats email case-insensitively (no duplicate via different casing)', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ email: testUser.email.toUpperCase(), password: testUser.password });
    expect(res.status).toBe(409);
  });

  it('rejects login before email is verified', async () => {
    const res = await request(app).post('/auth/login').send(testUser);
    expect(res.status).toBe(403);
  });

  it('resends a verification code to an unverified user', async () => {
    const res = await request(app).post('/auth/resend-verification').send({ email: testUser.email });

    expect(res.status).toBe(200);
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'verification', to: testUser.email }),
    );
  });

  it('rate-limits repeated resend requests (cooldown)', async () => {
    const res = await request(app).post('/auth/resend-verification').send({ email: testUser.email });
    expect(res.status).toBe(429);
  });

  it('does not reveal whether an email is registered on resend', async () => {
    const res = await request(app).post('/auth/resend-verification').send({ email: unknownEmail });

    expect(res.status).toBe(200);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('rejects a wrong verification code', async () => {
    // Real codes are always >= 100000, so this can never accidentally match.
    const res = await request(app)
      .post('/auth/verify-email')
      .send({ email: testUser.email, code: '000000' });
    expect(res.status).toBe(400);
  });

  it('verifies the email with the correct code', async () => {
    verificationCode = await getVerificationCode(testUser.email);

    const res = await request(app)
      .post('/auth/verify-email')
      .send({ email: testUser.email, code: verificationCode });

    expect(res.status).toBe(200);
    expect(res.body.user.emailVerified).toBe(true);
  });

  it('rejects reuse of an already-consumed verification code', async () => {
    const res = await request(app)
      .post('/auth/verify-email')
      .send({ email: testUser.email, code: verificationCode });
    expect(res.status).toBe(400);
  });

  it('logs in successfully after verification', async () => {
    const res = await request(app).post('/auth/login').send(testUser);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.headers['set-cookie']).toBeDefined();

    accessToken = res.body.accessToken;
    refreshCookie = res.headers['set-cookie']?.[0] ?? '';
  });

  it('returns the current user on GET /auth/me with a valid token', async () => {
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rejects GET /auth/me without a token', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects GET /auth/me with a garbage token', async () => {
    const res = await request(app).get('/auth/me').set('Authorization', 'Bearer not.a.token');
    expect(res.status).toBe(401);
  });

  it('rejects login with the wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: testUser.email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('issues a new, different access token via refresh', async () => {
    const res = await request(app).post('/auth/refresh').set('Cookie', refreshCookie);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.accessToken).not.toBe(accessToken);

    refreshCookie = res.headers['set-cookie']?.[0] ?? '';
  });

  it('rejects reuse of a rotated refresh token', async () => {
    // Log in fresh, rotate once, then try the OLD token again.
    const login = await request(app).post('/auth/login').send(testUser);
    const oldCookie = login.headers['set-cookie']?.[0] ?? '';

    await request(app).post('/auth/refresh').set('Cookie', oldCookie);
    const reuse = await request(app).post('/auth/refresh').set('Cookie', oldCookie);

    expect(reuse.status).toBe(401);
  });

  it('logs out and revokes the refresh token', async () => {
    const res = await request(app).post('/auth/logout').set('Cookie', refreshCookie);
    expect(res.status).toBe(204);
  });

  it('rejects refresh after logout (token was revoked)', async () => {
    const res = await request(app).post('/auth/refresh').set('Cookie', refreshCookie);
    expect(res.status).toBe(401);
  });
});

describe('Password reset', () => {
  let resetToken: string;
  let sessionCookie: string;

  it('does not reveal whether an email is registered', async () => {
    const res = await request(app).post('/auth/forgot-password').send({ email: unknownEmail });

    expect(res.status).toBe(200);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('creates a session that the reset should later revoke', async () => {
    const res = await request(app).post('/auth/login').send(testUser);

    expect(res.status).toBe(200);
    sessionCookie = res.headers['set-cookie']?.[0] ?? '';
  });

  it('enqueues a reset email for a known account', async () => {
    const res = await request(app).post('/auth/forgot-password').send({ email: testUser.email });

    expect(res.status).toBe(200);
    expect(publishMock).toHaveBeenCalledTimes(1);

    const job = publishMock.mock.calls[0]?.[0];
    if (!job || job.type !== 'password_reset') {
      throw new Error('Expected a password_reset job to be published');
    }
    resetToken = job.token;
  });

  it('rate-limits repeated forgot-password requests', async () => {
    const res = await request(app).post('/auth/forgot-password').send({ email: testUser.email });
    expect(res.status).toBe(429);
  });

  it('rejects an invalid reset token', async () => {
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: 'not-a-real-token', newPassword });
    expect(res.status).toBe(400);
  });

  it('rejects a too-short new password without consuming the token', async () => {
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: resetToken, newPassword: 'short' });
    expect(res.status).toBe(400);
  });

  it('resets the password with a valid token', async () => {
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: resetToken, newPassword });
    expect(res.status).toBe(200);
  });

  it('rejects reuse of the same reset token', async () => {
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: resetToken, newPassword: 'anotherPassword789' });
    expect(res.status).toBe(400);
  });

  it('rejects login with the old password', async () => {
    const res = await request(app).post('/auth/login').send(testUser);
    expect(res.status).toBe(401);
  });

  it('accepts login with the new password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: testUser.email, password: newPassword });
    expect(res.status).toBe(200);
  });

  it('revoked sessions that existed before the reset', async () => {
    const res = await request(app).post('/auth/refresh').set('Cookie', sessionCookie);
    expect(res.status).toBe(401);
  });
});