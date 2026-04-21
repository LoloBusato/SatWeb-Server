import { and, eq, isNull, sql } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../db/schema';
import { ConflictError, NotFoundError } from '../../domain/errors';

export type Branch = typeof schema.branches.$inferSelect;

export interface CreateBranchInput {
  name: string;
  contact: string;
  info: string;
  ganancia: number;
}

export interface UpdateBranchInput {
  name?: string;
  contact?: string;
  info?: string;
  ganancia?: number;
}

export class BranchRepository {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  async list(): Promise<Branch[]> {
    return this.db
      .select()
      .from(schema.branches)
      .where(isNull(schema.branches.deletedAt))
      .orderBy(schema.branches.id);
  }

  async findById(id: number): Promise<Branch | null> {
    const rows = await this.db
      .select()
      .from(schema.branches)
      .where(and(eq(schema.branches.id, id), isNull(schema.branches.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(input: CreateBranchInput): Promise<Branch> {
    const [inserted] = await this.db
      .insert(schema.branches)
      .values(input)
      .$returningId();
    const row = await this.findById(inserted.id);
    if (!row) throw new Error('Insert succeeded but row not found');
    return row;
  }

  async update(id: number, input: UpdateBranchInput): Promise<Branch> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError('Sucursal');

    const patch: Partial<CreateBranchInput> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.contact !== undefined) patch.contact = input.contact;
    if (input.info !== undefined) patch.info = input.info;
    if (input.ganancia !== undefined) patch.ganancia = input.ganancia;

    if (Object.keys(patch).length > 0) {
      await this.db.update(schema.branches).set(patch).where(eq(schema.branches.id, id));
    }
    const row = await this.findById(id);
    if (!row) throw new NotFoundError('Sucursal');
    return row;
  }

  async softDelete(id: number): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError('Sucursal');

    // Bloquea si hay usuarios activos asignados a esta sucursal.
    const result = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.users)
      .where(and(eq(schema.users.branchId, id), isNull(schema.users.deletedAt)));
    const count = Number(result[0]?.count ?? 0);
    if (count > 0) {
      throw new ConflictError(
        `La sucursal tiene ${count} usuario(s) activo(s). Reasignarlos antes de eliminarla.`,
      );
    }

    await this.db
      .update(schema.branches)
      .set({ deletedAt: new Date() })
      .where(eq(schema.branches.id, id));
  }
}
