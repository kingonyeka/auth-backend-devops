import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/db/prisma';
import { redis } from '../../src/lib/redis/client';

const app = createApp();

const testUser = {
  email: 'jest-test-user@example.com',
  password: 'password123',
};

// Verification codes are dev-stubbed to console.log, but they're also
// stored in Redis — reading them directly from there lets tests complete
// the flow without needing real email delivery.
async function getVerificationCode(email: string): Promise<string> {
  const code = await redis.get(`email_verification:${email}`);
  if (!code) throw new Error(`No verification code found in Redis for ${email}`);
  return code;
}

describe('Auth flow', () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email: testUser.email } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testUser.email } });
    await prisma.$disconnect();
    redis.disconnect();
  });

  let accessToken: string;
  let refreshCookie: string;

  it('signs up a new user', async () => {
    const res = await request(app).post('/auth/signup').send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user.emailVerified).toBe(false);
    expect(res.body.user.passwordHash).toBeUndefined(); // never leak the hash
  });

  it('rejects a duplicate signup with the same email', async () => {
    const res = await request(app).post('/auth/signup').send(testUser);
    expect(res.status).toBe(409);
  });

  it('rejects login before email is verified', async () => {
    const res = await request(app).post('/auth/login').send(testUser);
    expect(res.status).toBe(403);
  });

  it('verifies the email with the correct code', async () => {
    const code = await getVerificationCode(testUser.email);

    const res = await request(app)
      .post('/auth/verify-email')
      .send({ email: testUser.email, code });

    expect(res.status).toBe(200);
    expect(res.body.user.emailVerified).toBe(true);
  });

  it('rejects a reused verification code (one-time use)', async () => {
    const res = await request(app)
      .post('/auth/verify-email')
      .send({ email: testUser.email, code: '000000' });

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

  it('logs out and revokes the refresh token', async () => {
    const res = await request(app).post('/auth/logout').set('Cookie', refreshCookie);
    expect(res.status).toBe(204);
  });

  it('rejects refresh after logout (token was revoked)', async () => {
    const res = await request(app).post('/auth/refresh').set('Cookie', refreshCookie);
    expect(res.status).toBe(401);
  });
});