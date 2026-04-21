import { eq, inArray } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../db/schema';
import { ConflictError } from '../../domain/errors';

export type Permission = typeof schema.permissions.$inferSelect;

export class PermissionRepository {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  async listAll(): Promise<Permission[]> {
    return this.db
      .select()
      .from(schema.permissions)
      .orderBy(schema.permissions.code);
  }

  async listCodesByGroupId(groupId: number): Promise<string[]> {
    const rows = await this.db
      .select({ code: schema.permissions.code })
      .from(schema.permissions)
      .innerJoin(
        schema.groupPermissions,
        eq(schema.groupPermissions.permissionId, schema.permissions.id),
      )
      .where(eq(schema.groupPermissions.groupId, groupId));
    return rows.map((r) => r.code);
  }

  async listByGroupId(groupId: number): Promise<Permission[]> {
    const rows = await this.db
      .select({
        id: schema.permissions.id,
        code: schema.permissions.code,
        description: schema.permissions.description,
        createdAt: schema.permissions.createdAt,
      })
      .from(schema.permissions)
      .innerJoin(
        schema.groupPermissions,
        eq(schema.groupPermissions.permissionId, schema.permissions.id),
      )
      .where(eq(schema.groupPermissions.groupId, groupId));
    return rows;
  }

  async setGroupPermissions(groupId: number, permissionIds: number[]): Promise<Permission[]> {
    const unique = [...new Set(permissionIds)];

    if (unique.length > 0) {
      const found = await this.db
        .select({ id: schema.permissions.id })
        .from(schema.permissions)
        .where(inArray(schema.permissions.id, unique));
      if (found.length !== unique.length) {
        throw new ConflictError('Uno o más permisos no existen');
      }
    }

    await this.db
      .delete(schema.groupPermissions)
      .where(eq(schema.groupPermissions.groupId, groupId));

    if (unique.length > 0) {
      const rows = unique.map((pid) => ({ groupId, permissionId: pid }));
      await this.db.insert(schema.groupPermissions).values(rows);
    }

    return this.listByGroupId(groupId);
  }
}
