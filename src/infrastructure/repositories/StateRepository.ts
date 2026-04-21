import { and, eq, isNull, sql } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../db/schema';
import { ConflictError, NotFoundError } from '../../domain/errors';

export type State = typeof schema.states.$inferSelect;

export interface CreateStateInput {
  name: string;
  color?: string | null;
}

export interface UpdateStateInput {
  name?: string;
  color?: string | null;
}

export class StateRepository {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  async list(): Promise<State[]> {
    return this.db
      .select()
      .from(schema.states)
      .where(isNull(schema.states.deletedAt))
      .orderBy(schema.states.name);
  }

  async findById(id: number): Promise<State | null> {
    const rows = await this.db
      .select()
      .from(schema.states)
      .where(and(eq(schema.states.id, id), isNull(schema.states.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(input: CreateStateInput): Promise<State> {
    const [inserted] = await this.db
      .insert(schema.states)
      .values({ name: input.name, color: input.color ?? null })
      .$returningId();
    const row = await this.findById(inserted.id);
    if (!row) throw new Error('Insert succeeded but row not found');
    return row;
  }

  async update(id: number, input: UpdateStateInput): Promise<State> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError('Estado');

    const patch: { name?: string; color?: string | null } = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.color !== undefined) patch.color = input.color;

    if (Object.keys(patch).length > 0) {
      await this.db.update(schema.states).set(patch).where(eq(schema.states.id, id));
    }
    const row = await this.findById(id);
    if (!row) throw new NotFoundError('Estado');
    return row;
  }

  async softDelete(id: number): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError('Estado');

    // Bloquea el soft-delete si hay órdenes abiertas (returned_at IS NULL) con este estado.
    // Las órdenes ya entregadas pueden conservar el estado histórico.
    const result = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.orders)
      .where(and(eq(schema.orders.stateId, id), isNull(schema.orders.returnedAt)));
    const count = Number(result[0]?.count ?? 0);
    if (count > 0) {
      throw new ConflictError(
        `El estado tiene ${count} orden(es) activa(s). Reasignarlas antes de eliminarlo.`,
      );
    }

    await this.db
      .update(schema.states)
      .set({ deletedAt: new Date() })
      .where(eq(schema.states.id, id));
  }
}
