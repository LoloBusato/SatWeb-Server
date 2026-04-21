import { and, eq, isNull } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../db/schema';
import type { User } from '../../domain/entities/User';

export class UserRepository {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

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

  async updatePasswordHash(id: number, passwordHash: string): Promise<void> {
    await this.db
      .update(schema.users)
      .set({ passwordHash })
      .where(eq(schema.users.id, id));
  }
}
