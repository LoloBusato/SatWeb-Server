import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../db/schema';

export class PermissionRepository {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

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
}
