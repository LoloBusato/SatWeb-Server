import { and, desc, eq, isNull, type SQL } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import { ConflictError, NotFoundError } from '../../domain/errors';

/**
 * Nombre exacto del estado que marca una orden como entregada. Cuando
 * el state_id de una orden cambia a un estado con este nombre, la lógica
 * en updateState también setea returned_at. El nombre matchea el del
 * legacy (WHERE state = 'ENTREGADO' en CRUD/orders.js) y seguirá siendo
 * autoritativo hasta que Fase 3 agregue una columna explícita
 * states.marks_as_delivered.
 */
const ENTREGADO_STATE_NAME = 'ENTREGADO';

export interface ListOrdersOptions {
  limit: number;
  offset: number;
  deliveredOnly?: boolean;
}

export interface OrderListItem {
  id: number;
  clientId: number;
  clientName: string;
  deviceId: number;
  deviceModel: string;
  stateId: number;
  stateName: string;
  stateColor: string | null;
  branchId: number;
  branchName: string;
  createdAt: string;
  returnedAt: string | null;
}

export interface OrderDetail extends OrderListItem {
  problem: string;
  serial: string | null;
  deviceColor: string | null;
  usersId: number;
}

/**
 * Formato d/m/yyyy para orders.returned_at (VARCHAR(11)). Replica el formato
 * que el frontend legacy escribe con `toLocaleString('en-IN', ...)`. Se
 * migra a DATETIME en Fase 3.
 */
function formatDeliveryDate(now: Date = new Date()): string {
  return now.toLocaleDateString('en-IN', {
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

export class OrderRepository {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  async listByBranch(
    branchId: number | null,
    opts: ListOrdersOptions,
  ): Promise<OrderListItem[]> {
    const conditions: SQL[] = [];
    if (branchId !== null) {
      conditions.push(eq(schema.orders.branchId, branchId));
    }
    if (opts.deliveredOnly === true) {
      conditions.push(sql`${schema.orders.returnedAt} IS NOT NULL`);
    } else if (opts.deliveredOnly === false) {
      conditions.push(sql`${schema.orders.returnedAt} IS NULL`);
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select({
        id: schema.orders.id,
        clientId: schema.orders.clientId,
        clientName: sql<string>`CONCAT_WS(' ', ${schema.clients.name}, ${schema.clients.surname})`,
        deviceId: schema.orders.deviceId,
        deviceModel: schema.devices.model,
        stateId: schema.orders.stateId,
        stateName: schema.states.name,
        stateColor: schema.states.color,
        branchId: schema.orders.branchId,
        branchName: schema.branches.name,
        createdAt: schema.orders.createdAt,
        returnedAt: schema.orders.returnedAt,
      })
      .from(schema.orders)
      .innerJoin(schema.clients, eq(schema.clients.id, schema.orders.clientId))
      .innerJoin(schema.devices, eq(schema.devices.id, schema.orders.deviceId))
      .innerJoin(schema.states, eq(schema.states.id, schema.orders.stateId))
      .innerJoin(schema.branches, eq(schema.branches.id, schema.orders.branchId))
      .where(whereClause)
      .orderBy(desc(schema.orders.id))
      .limit(opts.limit)
      .offset(opts.offset);

    return rows;
  }

  async findById(id: number, branchFilter: number | null): Promise<OrderDetail | null> {
    const conditions: SQL[] = [eq(schema.orders.id, id)];
    if (branchFilter !== null) {
      conditions.push(eq(schema.orders.branchId, branchFilter));
    }

    const rows = await this.db
      .select({
        id: schema.orders.id,
        clientId: schema.orders.clientId,
        clientName: sql<string>`CONCAT_WS(' ', ${schema.clients.name}, ${schema.clients.surname})`,
        deviceId: schema.orders.deviceId,
        deviceModel: schema.devices.model,
        stateId: schema.orders.stateId,
        stateName: schema.states.name,
        stateColor: schema.states.color,
        branchId: schema.orders.branchId,
        branchName: schema.branches.name,
        createdAt: schema.orders.createdAt,
        returnedAt: schema.orders.returnedAt,
        problem: schema.orders.problem,
        serial: schema.orders.serial,
        deviceColor: schema.orders.deviceColor,
        usersId: schema.orders.usersId,
      })
      .from(schema.orders)
      .innerJoin(schema.clients, eq(schema.clients.id, schema.orders.clientId))
      .innerJoin(schema.devices, eq(schema.devices.id, schema.orders.deviceId))
      .innerJoin(schema.states, eq(schema.states.id, schema.orders.stateId))
      .innerJoin(schema.branches, eq(schema.branches.id, schema.orders.branchId))
      .where(and(...conditions))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Transición de estado de una orden. Orquesta:
   *   1. Validación del nuevo estado (existe, no soft-deleted).
   *   2. Evita transiciones no-op (mismo state_id).
   *   3. Transacción: UPDATE orders (state_id, y returned_at si el nuevo estado
   *      se llama ENTREGADO y no estaba ya entregada) + INSERT audit trail.
   *
   * El caller es responsable de haber validado el branch scope (con
   * findById + branchFilter) antes de llamar acá.
   */
  async updateState(
    orderId: number,
    newStateId: number,
    changedByUserId: number,
    note: string | null,
  ): Promise<OrderDetail> {
    const orderRows = await this.db
      .select({
        stateId: schema.orders.stateId,
        returnedAt: schema.orders.returnedAt,
      })
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId))
      .limit(1);
    const order = orderRows[0];
    if (!order) throw new NotFoundError('Orden');

    if (order.stateId === newStateId) {
      throw new ConflictError('La orden ya está en ese estado');
    }

    const stateRows = await this.db
      .select({ id: schema.states.id, name: schema.states.name })
      .from(schema.states)
      .where(and(eq(schema.states.id, newStateId), isNull(schema.states.deletedAt)))
      .limit(1);
    const newState = stateRows[0];
    if (!newState) throw new ConflictError('Estado inexistente o eliminado');

    const updates: { stateId: number; returnedAt?: string } = { stateId: newStateId };
    if (newState.name === ENTREGADO_STATE_NAME && !order.returnedAt) {
      updates.returnedAt = formatDeliveryDate();
    }

    const fromStateId = order.stateId;

    await this.db.transaction(async (tx) => {
      await tx.update(schema.orders).set(updates).where(eq(schema.orders.id, orderId));
      await tx.insert(schema.orderStateHistory).values({
        orderId,
        fromStateId,
        toStateId: newStateId,
        changedBy: changedByUserId,
        note,
      });
    });

    const updated = await this.findById(orderId, null);
    if (!updated) throw new NotFoundError('Orden');
    return updated;
  }
}
