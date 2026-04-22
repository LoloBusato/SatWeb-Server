import { asc, eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../db/schema';

export interface OrderStateTransition {
  id: number;
  orderId: number;
  fromStateId: number | null;
  fromStateName: string | null;
  toStateId: number;
  toStateName: string | null;
  changedBy: number;
  changedByUsername: string | null;
  changedAt: Date;
  note: string | null;
}

/**
 * Alias separado para el segundo JOIN a `states` (from_state_id). Drizzle
 * requiere alias explícito cuando la misma tabla se une dos veces.
 */
const fromStates = schema.states;

export class OrderStateHistoryRepository {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  async listByOrderId(orderId: number): Promise<OrderStateTransition[]> {
    const rows = await this.db
      .select({
        id: schema.orderStateHistory.id,
        orderId: schema.orderStateHistory.orderId,
        fromStateId: schema.orderStateHistory.fromStateId,
        toStateId: schema.orderStateHistory.toStateId,
        changedBy: schema.orderStateHistory.changedBy,
        changedAt: schema.orderStateHistory.changedAt,
        note: schema.orderStateHistory.note,
        toStateName: schema.states.name,
        changedByUsername: schema.users.username,
      })
      .from(schema.orderStateHistory)
      .leftJoin(
        schema.states,
        eq(schema.states.id, schema.orderStateHistory.toStateId),
      )
      .leftJoin(
        schema.users,
        eq(schema.users.id, schema.orderStateHistory.changedBy),
      )
      .where(eq(schema.orderStateHistory.orderId, orderId))
      .orderBy(asc(schema.orderStateHistory.changedAt));

    // El nombre del estado anterior se resuelve en una segunda pasada
    // para evitar un tercer JOIN sobre la misma tabla `states` (complica
    // los tipos en Drizzle). Con la cantidad esperada de filas por orden
    // (<20) el costo extra es despreciable.
    const fromStateIds = [
      ...new Set(rows.map((r) => r.fromStateId).filter((v): v is number => v !== null)),
    ];
    const fromStateMap = new Map<number, string>();
    if (fromStateIds.length > 0) {
      const fromRows = await this.db
        .select({ id: fromStates.id, name: fromStates.name })
        .from(fromStates);
      for (const s of fromRows) fromStateMap.set(s.id, s.name);
    }

    return rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      fromStateId: r.fromStateId,
      fromStateName: r.fromStateId !== null ? fromStateMap.get(r.fromStateId) ?? null : null,
      toStateId: r.toStateId,
      toStateName: r.toStateName,
      changedBy: r.changedBy,
      changedByUsername: r.changedByUsername,
      changedAt: r.changedAt,
      note: r.note,
    }));
  }
}
