import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../db/schema';
import type { User } from '../../domain/entities/User';
import { ConflictError, NotFoundError } from '../../domain/errors';

export interface CreateUserInput {
  username: string;
  passwordHash: string;
  groupId: number;
  branchId: number;
  userColor?: string | null;
}

export interface UpdateUserInput {
  username?: string;
  passwordHash?: string;
  groupId?: number;
  branchId?: number;
  userColor?: string | null;
  enabled?: boolean;
}

function isDuplicateError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'ER_DUP_ENTRY'
  );
}

export class UserRepository {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  async list(): Promise<User[]> {
    return this.db
      .select()
      .from(schema.users)
      .where(isNull(schema.users.deletedAt))
      .orderBy(schema.users.username);
  }

  async findByUsername(username: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.username, username), isNull(schema.users.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  async findById(id: number): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, id), isNull(schema.users.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(input: CreateUserInput): Promise<User> {
    try {
      const [inserted] = await this.db
        .insert(schema.users)
        .values({
          username: input.username,
          passwordHash: input.passwordHash,
          groupId: input.groupId,
          branchId: input.branchId,
          ...(input.userColor !== undefined ? { userColor: input.userColor } : {}),
        })
        .$returningId();
      const row = await this.findById(inserted.id);
      if (!row) throw new Error('Insert succeeded but row not found');
      return row;
    } catch (err) {
      if (isDuplicateError(err)) {
        throw new ConflictError(`Ya existe un usuario con username "${input.username}"`);
      }
      throw err;
    }
  }

  async update(id: number, input: UpdateUserInput): Promise<User> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError('Usuario');

    const patch: Partial<{
      username: string;
      passwordHash: string;
      groupId: number;
      branchId: number;
      userColor: string | null;
      enabled: number;
    }> = {};
    if (input.username !== undefined) patch.username = input.username;
    if (input.passwordHash !== undefined) patch.passwordHash = input.passwordHash;
    if (input.groupId !== undefined) patch.groupId = input.groupId;
    if (input.branchId !== undefined) patch.branchId = input.branchId;
    if (input.userColor !== undefined) patch.userColor = input.userColor;
    if (input.enabled !== undefined) patch.enabled = input.enabled ? 1 : 0;

    if (Object.keys(patch).length > 0) {
      try {
        await this.db.update(schema.users).set(patch).where(eq(schema.users.id, id));
      } catch (err) {
        if (isDuplicateError(err)) {
          throw new ConflictError(`Ya existe un usuario con ese username`);
        }
        throw err;
      }
    }

    const row = await this.findById(id);
    if (!row) throw new NotFoundError('Usuario');
    return row;
  }

  async updatePasswordHash(id: number, passwordHash: string): Promise<void> {
    await this.db
      .update(schema.users)
      .set({ passwordHash })
      .where(eq(schema.users.id, id));
  }

  async userHasPermission(userId: number, code: string): Promise<boolean> {
    const rows = await this.db
      .select({ one: sql<number>`1` })
      .from(schema.users)
      .innerJoin(
        schema.groupPermissions,
        eq(schema.groupPermissions.groupId, schema.users.groupId),
      )
      .innerJoin(
        schema.permissions,
        eq(schema.permissions.id, schema.groupPermissions.permissionId),
      )
      .where(and(eq(schema.users.id, userId), eq(schema.permissions.code, code)))
      .limit(1);
    return rows.length > 0;
  }

  async countActiveUsersWithPermission(code: string, excludingUserId?: number): Promise<number> {
    const baseWhere = and(
      eq(schema.permissions.code, code),
      isNull(schema.users.deletedAt),
      excludingUserId !== undefined ? ne(schema.users.id, excludingUserId) : undefined,
    );
    const rows = await this.db
      .selectDistinct({ id: schema.users.id })
      .from(schema.users)
      .innerJoin(
        schema.groupPermissions,
        eq(schema.groupPermissions.groupId, schema.users.groupId),
      )
      .innerJoin(
        schema.permissions,
        eq(schema.permissions.id, schema.groupPermissions.permissionId),
      )
      .where(baseWhere);
    return rows.length;
  }

  async softDelete(id: number): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError('Usuario');

    const hasViewAll = await this.userHasPermission(id, 'branches:view_all');
    if (hasViewAll) {
      const others = await this.countActiveUsersWithPermission('branches:view_all', id);
      if (others === 0) {
        throw new ConflictError(
          'No se puede eliminar: es el único usuario activo con el permiso branches:view_all. Asignar el permiso a otro grupo/usuario antes.',
        );
      }
    }

    await this.db
      .update(schema.users)
      .set({ deletedAt: new Date() })
      .where(eq(schema.users.id, id));
  }
}
