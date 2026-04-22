import { and, eq, isNull } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../db/schema';
import { ConflictError, NotFoundError } from '../../domain/errors';

export type BranchSettings = typeof schema.branchSettings.$inferSelect;

export interface UpsertBranchSettingsInput {
  readyStateId: number;
  incucaiStateId: number;
  pickupReminderHours?: number;
  incucaiAfterDays?: number;
}

export class BranchSettingsRepository {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  async findByBranchId(branchId: number): Promise<BranchSettings | null> {
    const rows = await this.db
      .select()
      .from(schema.branchSettings)
      .where(eq(schema.branchSettings.branchId, branchId))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Crea o actualiza settings de una sucursal. Valida que:
   *   - La sucursal existe y no está soft-deleted.
   *   - Los state_ids referenciados existen y no están soft-deleted.
   *   - readyStateId != incucaiStateId (no tiene sentido que sean iguales).
   */
  async upsert(branchId: number, input: UpsertBranchSettingsInput): Promise<BranchSettings> {
    if (input.readyStateId === input.incucaiStateId) {
      throw new ConflictError(
        'readyStateId y incucaiStateId no pueden ser el mismo estado',
      );
    }

    const branch = await this.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(and(eq(schema.branches.id, branchId), isNull(schema.branches.deletedAt)))
      .limit(1);
    if (branch.length === 0) throw new NotFoundError('Sucursal');

    const stateIds = [input.readyStateId, input.incucaiStateId];
    const states = await this.db
      .select({ id: schema.states.id })
      .from(schema.states)
      .where(and(isNull(schema.states.deletedAt)));
    const validIds = new Set(states.map((s) => s.id));
    for (const id of stateIds) {
      if (!validIds.has(id)) {
        throw new ConflictError(`El estado ${id} no existe o está eliminado`);
      }
    }

    const values = {
      branchId,
      readyStateId: input.readyStateId,
      incucaiStateId: input.incucaiStateId,
      pickupReminderHours: input.pickupReminderHours ?? 48,
      incucaiAfterDays: input.incucaiAfterDays ?? 180,
    };

    await this.db
      .insert(schema.branchSettings)
      .values(values)
      .onDuplicateKeyUpdate({
        set: {
          readyStateId: values.readyStateId,
          incucaiStateId: values.incucaiStateId,
          pickupReminderHours: values.pickupReminderHours,
          incucaiAfterDays: values.incucaiAfterDays,
        },
      });

    const row = await this.findByBranchId(branchId);
    if (!row) throw new Error('Upsert succeeded but row not found');
    return row;
  }
}
