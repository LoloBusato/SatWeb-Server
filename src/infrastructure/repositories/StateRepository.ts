import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../db/schema';
import { ConflictError, NotFoundError } from '../../domain/errors';

export type State = typeof schema.states.$inferSelect;

export type StateWithCount = State & { ordersCount: number };

export interface CreateStateInput {
  name: string;
  color?: string | null;
}

export interface UpdateStateInput {
  name?: string;
  color?: string | null;
}

// Estado interno usado como fallback cuando se elimina un estado que tiene
// órdenes activas: las órdenes se reasignan acá y luego el estado original
// se soft-deletea. No es editable ni visible en la UI de CRUD de estados.
export const SIN_ESTADO_NAME = 'Sin estado';

export class StateRepository {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  async list(): Promise<StateWithCount[]> {
    const rows = await this.db
      .select({
        id: schema.states.id,
        name: schema.states.name,
        color: schema.states.color,
        marksAsDelivered: schema.states.marksAsDelivered,
        forcesAdminAssignment: schema.states.forcesAdminAssignment,
        deletedAt: schema.states.deletedAt,
        ordersCount: sql<number>`(
          SELECT COUNT(*) FROM orders
          WHERE orders.state_id = ${schema.states.id}
        )`,
      })
      .from(schema.states)
      .where(and(isNull(schema.states.deletedAt), ne(schema.states.name, SIN_ESTADO_NAME)))
      .orderBy(schema.states.name);

    return rows.map((r) => ({ ...r, ordersCount: Number(r.ordersCount) }));
  }

  async findById(id: number): Promise<State | null> {
    const rows = await this.db
      .select()
      .from(schema.states)
      .where(and(eq(schema.states.id, id), isNull(schema.states.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Crea o reactiva un estado por nombre. Casos:
   *   - Existe activo (deletedAt IS NULL) → 409 ConflictError "duplicado".
   *   - Existe soft-deleted → UPDATE deletedAt=NULL (+ color si vino en
   *     el input) y devuelve { state, reactivated: true } para que el
   *     route handler muestre el mensaje correcto.
   *   - No existe → INSERT normal, { state, reactivated: false }.
   *
   * Match exacto por nombre (case-sensitive). Resuelve el problema clásico
   * de borrar un estado por error y querer "recrearlo" — antes la base
   * acumulaba filas soft-deleted con el mismo nombre y no se podía
   * recrear sin tocar la DB.
   */
  async create(input: CreateStateInput): Promise<{ state: State; reactivated: boolean }> {
    const existingRows = await this.db
      .select()
      .from(schema.states)
      .where(eq(schema.states.name, input.name))
      .limit(1);
    const existing = existingRows[0];

    if (existing && existing.deletedAt === null) {
      throw new ConflictError(`Ya existe un estado con el nombre "${input.name}"`);
    }

    if (existing && existing.deletedAt !== null) {
      // Reactivar — limpia deletedAt y opcionalmente actualiza color.
      const patch: { deletedAt: null; color?: string | null } = { deletedAt: null };
      if (input.color !== undefined) patch.color = input.color;
      await this.db.update(schema.states).set(patch).where(eq(schema.states.id, existing.id));
      const row = await this.findById(existing.id);
      if (!row) throw new Error('Reactivation succeeded but row not found');
      return { state: row, reactivated: true };
    }

    const [inserted] = await this.db
      .insert(schema.states)
      .values({ name: input.name, color: input.color ?? null })
      .$returningId();
    const row = await this.findById(inserted.id);
    if (!row) throw new Error('Insert succeeded but row not found');
    return { state: row, reactivated: false };
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

  /**
   * Soft-delete de un estado. Dos modos:
   *   - `force=false` (default): si hay órdenes activas (returned_at IS NULL)
   *     usando el estado, tira ConflictError con `details.activeOrders = N`
   *     para que el caller pida confirmación al usuario.
   *   - `force=true`: en una sola transacción, reasigna las órdenes activas
   *     al estado interno "Sin estado" (creándolo si no existe) y luego
   *     soft-deletea el estado original.
   *
   * Nunca permite borrar "Sin estado" porque es el fallback del sistema.
   */
  async softDelete(id: number, options: { force?: boolean } = {}): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError('Estado');

    if (existing.name === SIN_ESTADO_NAME) {
      throw new ConflictError(
        'No se puede eliminar el estado interno "Sin estado" (fallback del sistema).',
      );
    }

    const result = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.orders)
      .where(and(eq(schema.orders.stateId, id), isNull(schema.orders.returnedAt)));
    const activeOrders = Number(result[0]?.count ?? 0);

    if (activeOrders === 0) {
      await this.db
        .update(schema.states)
        .set({ deletedAt: new Date() })
        .where(eq(schema.states.id, id));
      return;
    }

    if (!options.force) {
      throw new ConflictError(
        `El estado tiene ${activeOrders} orden(es) activa(s). Confirmar reasignación a "Sin estado".`,
        { activeOrders },
      );
    }

    await this.db.transaction(async (tx) => {
      // find-or-create "Sin estado" dentro de la tx. Si dos admins borran
      // estados simultáneamente podría crearse duplicado — acepto el race
      // porque es una operación admin-only muy poco frecuente.
      const existingSin = await tx
        .select()
        .from(schema.states)
        .where(and(eq(schema.states.name, SIN_ESTADO_NAME), isNull(schema.states.deletedAt)))
        .limit(1);

      let sinEstadoId: number;
      if (existingSin.length > 0) {
        sinEstadoId = existingSin[0].id;
      } else {
        const [inserted] = await tx
          .insert(schema.states)
          .values({ name: SIN_ESTADO_NAME, color: null })
          .$returningId();
        sinEstadoId = inserted.id;
      }

      await tx
        .update(schema.orders)
        .set({ stateId: sinEstadoId })
        .where(and(eq(schema.orders.stateId, id), isNull(schema.orders.returnedAt)));

      await tx
        .update(schema.states)
        .set({ deletedAt: new Date() })
        .where(eq(schema.states.id, id));
    });
  }
}
