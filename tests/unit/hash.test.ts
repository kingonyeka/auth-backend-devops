import { hashPassword, verifyPassword } from '../../src/utils/hash';

describe('hash utils', () => {
  it('produces a hash different from the original password', async () => {
    const plain = 'mySecretPassword123';
    const hash = await hashPassword(plain);

    expect(hash).not.toBe(plain);
    expect(hash.length).toBeGreaterThan(20);
  });

  it('verifies a correct password against its hash', async () => {
    const plain = 'mySecretPassword123';
    const hash = await hashPassword(plain);

    const result = await verifyPassword(hash, plain);
    expect(result).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correctPassword');
    const result = await verifyPassword(hash, 'wrongPassword');

    expect(result).toBe(false);
  });

  it('returns false (not throw) for a malformed hash', async () => {
    const result = await verifyPassword('not-a-real-hash', 'anything');
    expect(result).toBe(false);
  });

  it('produces different hashes for the same password (random salt)', async () => {
    const hash1 = await hashPassword('samePassword');
    const hash2 = await hashPassword('samePassword');

    expect(hash1).not.toBe(hash2);
  });
});