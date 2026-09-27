import { prisma } from '../../lib/db/prisma';
import type { PublicUser } from './users.types';

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export async function createUser(email: string, passwordHash: string) {
  return prisma.user.create({ data: { email, passwordHash } });
}

export async function markEmailVerified(userId: string) {
  return prisma.user.update({ where: { id: userId }, data: { emailVerified: true } });
}

// Never return the passwordHash to a client — this is the single boundary
// point where a full DB user gets converted to what's safe to expose.
export function toPublicUser(user: {
  id: string;
  email: string;
  emailVerified: boolean;
}): PublicUser {
  return { id: user.id, email: user.email, emailVerified: user.emailVerified };
}
