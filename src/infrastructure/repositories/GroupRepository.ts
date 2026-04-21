import { and, eq, isNull, sql } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../db/schema';
import { ConflictError, NotFoundError } from '../../domain/errors';

export type Group = typeof schema.groups.$inferSelect;

export interface CreateGroupInput {
  name: string;
}

export interface UpdateGroupInput {
  name?: string;
}

export class GroupRepository {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  async list(): Promise<Group[]> {
    return this.db
      .select()
      .from(schema.groups)
      .where(isNull(schema.groups.deletedAt))
      .orderBy(schema.groups.name);
  }

  async findById(id: number): Promise<Group | null> {
    const rows = await this.db
      .select()
      .from(schema.groups)
      .where(and(eq(schema.groups.id, id), isNull(schema.groups.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(input: CreateGroupInput): Promise<Group> {
    const [inserted] = await this.db
      .insert(schema.groups)
      .values({ name: input.name })
      .$returningId();
    const row = await this.findById(inserted.id);
    if (!row) throw new Error('Insert succeeded but row not found');
    return row;
  }

  async update(id: number, input: UpdateGroupInput): Promise<Group> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError('Grupo');

    if (input.name !== undefined) {
      await this.db
        .update(schema.groups)
        .set({ name: input.name })
        .where(eq(schema.groups.id, id));
    }
    const row = await this.findById(id);
    if (!row) throw new NotFoundError('Grupo');
    return row;
  }

  async softDelete(id: number): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError('Grupo');

    const result = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.users)
      .where(and(eq(schema.users.groupId, id), isNull(schema.users.deletedAt)));
    const count = Number(result[0]?.count ?? 0);
    if (count > 0) {
      throw new ConflictError(
        `El grupo tiene ${count} usuario(s) activo(s). Reasignarlos antes de eliminarlo.`,
      );
    }

    await this.db
      .update(schema.groups)
      .set({ deletedAt: new Date() })
      .where(eq(schema.groups.id, id));
  }
}
