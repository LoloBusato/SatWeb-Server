import type { users } from '../../infrastructure/db/schema';

export type User = typeof users.$inferSelect;

export function isUserActive(u: User): boolean {
  return u.deletedAt === null;
}

export function isBcryptHash(value: string): boolean {
  return value.length === 60 && value.startsWith('$2');
}

export interface PublicUser {
  id: number;
  username: string;
  branchId: number;
  groupId: number;
  userColor: string | null;
}

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    username: u.username,
    branchId: u.branchId,
    groupId: u.groupId,
    userColor: u.userColor,
  };
}
