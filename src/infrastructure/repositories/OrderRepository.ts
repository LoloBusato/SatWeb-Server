import { and, desc, eq, isNull, or, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import { ConflictError, NotFoundError } from '../../domain/errors';

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
  currentBranchId: number;
  currentBranchName: string;
  createdAt: string;
  returnedAt: string | null;
}

export interface OrderDetail extends OrderListItem {
  problem: string;
  serial: string | null;
  deviceColor: string | null;
  usersId: number;
}

export interface PickupPendingItem {
  id: number;
  clientName: string;
  deviceModel: string;
  stateId: number;
  stateName: string;
  branchId: number;
  branchName: string;
  readyStateId: number;
  lastReadyAt: Date;
  hoursSinceReady: number;
}

export interface IncucaiEligibleItem extends PickupPendingItem {
  incucaiStateId: number;
  daysSinceReady: number;
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
    const originBranch = alias(schema.branches, 'origin_branch');
    const currentBranch = alias(schema.branches, 'current_branch');

    const conditions: SQL[] = [];
    if (branchId !== null) {
      // Multi-tenancy Fase 2.3: el user ve órdenes ORIGINADAS en su sucursal
      // O actualmente UBICADAS ahí. Eso permite al lab branch ver las órdenes
      // recibidas de otra sucursal para reparación.
      const branchOr = or(
        eq(schema.orders.branchId, branchId),
        eq(schema.orders.currentBranchId, branchId),
      );
      if (branchOr) conditions.push(branchOr);
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
        branchName: originBranch.name,
        currentBranchId: schema.orders.currentBranchId,
        currentBranchName: currentBranch.name,
        createdAt: schema.orders.createdAt,
        returnedAt: schema.orders.returnedAt,
      })
      .from(schema.orders)
      .innerJoin(schema.clients, eq(schema.clients.id, schema.orders.clientId))
      .innerJoin(schema.devices, eq(schema.devices.id, schema.orders.deviceId))
      .innerJoin(schema.states, eq(schema.states.id, schema.orders.stateId))
      .innerJoin(originBranch, eq(originBranch.id, schema.orders.branchId))
      .innerJoin(currentBranch, eq(currentBranch.id, schema.orders.currentBranchId))
      .where(whereClause)
      .orderBy(desc(schema.orders.id))
      .limit(opts.limit)
      .offset(opts.offset);

    return rows;
  }

  async findById(id: number, branchFilter: number | null): Promise<OrderDetail | null> {
    const originBranch = alias(schema.branches, 'origin_branch');
    const currentBranch = alias(schema.branches, 'current_branch');

    const conditions: SQL[] = [eq(schema.orders.id, id)];
    if (branchFilter !== null) {
      const branchOr = or(
        eq(schema.orders.branchId, branchFilter),
        eq(schema.orders.currentBranchId, branchFilter),
      );
      if (branchOr) conditions.push(branchOr);
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
        branchName: originBranch.name,
        currentBranchId: schema.orders.currentBranchId,
        currentBranchName: currentBranch.name,
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
      .innerJoin(originBranch, eq(originBranch.id, schema.orders.branchId))
      .innerJoin(currentBranch, eq(currentBranch.id, schema.orders.currentBranchId))
      .where(and(...conditions))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Transfiere físicamente un equipo a otra sucursal. Actualiza
   * orders.current_branch_id (no toca branches_id que es el origen
   * inmutable) y registra la transferencia en order_location_history en
   * una transacción.
   *
   * El caller es responsable de haber validado branch scope vía findById
   * + branchFilter antes de llamar acá.
   */
  async transfer(
    orderId: number,
    toBranchId: number,
    transferredByUserId: number,
    note: string | null,
  ): Promise<OrderDetail> {
    const orderRows = await this.db
      .select({ currentBranchId: schema.orders.currentBranchId })
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId))
      .limit(1);
    const order = orderRows[0];
    if (!order) throw new NotFoundError('Orden');

    if (order.currentBranchId === toBranchId) {
      throw new ConflictError('La orden ya está en esa sucursal');
    }

    const branchRows = await this.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(and(eq(schema.branches.id, toBranchId), isNull(schema.branches.deletedAt)))
      .limit(1);
    if (branchRows.length === 0) {
      throw new ConflictError('Sucursal destino inexistente o eliminada');
    }

    const fromBranchId = order.currentBranchId;

    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.orders)
        .set({ currentBranchId: toBranchId })
        .where(eq(schema.orders.id, orderId));
      await tx.insert(schema.orderLocationHistory).values({
        orderId,
        fromBranchId,
        toBranchId,
        transferredBy: transferredByUserId,
        note,
      });
    });

    const updated = await this.findById(orderId, null);
    if (!updated) throw new NotFoundError('Orden');
    return updated;
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
  /**
   * Órdenes en el estado "ready" (configurado por sucursal) cuya última
   * transición a ese estado fue hace >= pickup_reminder_hours atrás.
   *
   * Sólo se consideran sucursales con branch_settings configurado; las que
   * no tienen config no aparecen (JOIN INNER con branch_settings).
   *
   * Requiere `order_state_history`: órdenes que estaban en el estado antes
   * de Fase 2.1 no tienen historial y quedan fuera hasta que su estado
   * cambie por primera vez.
   */
  async listPickupPending(branchFilter: number | null): Promise<PickupPendingItem[]> {
    const branchClause = branchFilter !== null
      ? sql`AND o.branches_id = ${branchFilter}`
      : sql``;
    const [rows] = (await this.db.execute(sql`
      SELECT
        o.order_id AS id,
        CONCAT_WS(' ', c.name, c.surname) AS clientName,
        d.model AS deviceModel,
        o.state_id AS stateId,
        s.state AS stateName,
        o.branches_id AS branchId,
        br.branch AS branchName,
        bs.ready_state_id AS readyStateId,
        MAX(osh.changed_at) AS lastReadyAt,
        TIMESTAMPDIFF(HOUR, MAX(osh.changed_at), NOW()) AS hoursSinceReady
      FROM orders o
      JOIN branch_settings bs ON bs.branch_id = o.branches_id
      JOIN clients c ON c.idclients = o.client_id
      JOIN devices d ON d.iddevices = o.device_id
      JOIN states s ON s.idstates = o.state_id
      JOIN branches br ON br.idbranches = o.branches_id
      LEFT JOIN order_state_history osh
        ON osh.order_id = o.order_id AND osh.to_state_id = bs.ready_state_id
      WHERE o.state_id = bs.ready_state_id
        AND o.returned_at IS NULL
        ${branchClause}
      GROUP BY o.order_id, bs.ready_state_id, bs.pickup_reminder_hours
      HAVING MAX(osh.changed_at) IS NOT NULL
        AND MAX(osh.changed_at) <= NOW() - INTERVAL bs.pickup_reminder_hours HOUR
      ORDER BY MAX(osh.changed_at) ASC
    `)) as unknown as [PickupPendingItem[]];
    return rows;
  }

  async listIncucaiEligible(branchFilter: number | null): Promise<IncucaiEligibleItem[]> {
    const branchClause = branchFilter !== null
      ? sql`AND o.branches_id = ${branchFilter}`
      : sql``;
    const [rows] = (await this.db.execute(sql`
      SELECT
        o.order_id AS id,
        CONCAT_WS(' ', c.name, c.surname) AS clientName,
        d.model AS deviceModel,
        o.state_id AS stateId,
        s.state AS stateName,
        o.branches_id AS branchId,
        br.branch AS branchName,
        bs.ready_state_id AS readyStateId,
        bs.incucai_state_id AS incucaiStateId,
        MAX(osh.changed_at) AS lastReadyAt,
        TIMESTAMPDIFF(DAY, MAX(osh.changed_at), NOW()) AS daysSinceReady
      FROM orders o
      JOIN branch_settings bs ON bs.branch_id = o.branches_id
      JOIN clients c ON c.idclients = o.client_id
      JOIN devices d ON d.iddevices = o.device_id
      JOIN states s ON s.idstates = o.state_id
      JOIN branches br ON br.idbranches = o.branches_id
      LEFT JOIN order_state_history osh
        ON osh.order_id = o.order_id AND osh.to_state_id = bs.ready_state_id
      WHERE o.state_id = bs.ready_state_id
        AND o.returned_at IS NULL
        ${branchClause}
      GROUP BY o.order_id, bs.ready_state_id, bs.incucai_state_id, bs.incucai_after_days
      HAVING MAX(osh.changed_at) IS NOT NULL
        AND MAX(osh.changed_at) <= NOW() - INTERVAL bs.incucai_after_days DAY
      ORDER BY MAX(osh.changed_at) ASC
    `)) as unknown as [IncucaiEligibleItem[]];
    return rows;
  }

  /**
   * Mueve al estado INCUCAI de su sucursal a cada orden elegible. Loop por
   * orden para que cada transición quede registrada individualmente en
   * `order_state_history` (reusa updateState, que es transaccional). Devuelve
   * la cantidad efectivamente archivada.
   */
  async archiveOverdue(
    branchFilter: number | null,
    changedByUserId: number,
  ): Promise<{ archived: number; orderIds: number[] }> {
    const eligible = await this.listIncucaiEligible(branchFilter);
    const archived: number[] = [];
    for (const row of eligible) {
      try {
        await this.updateState(row.id, row.incucaiStateId, changedByUserId, 'archivado automático');
        archived.push(row.id);
      } catch (err) {
        // Una orden que falla (ej. transición no-op porque ya se archivó
        // en paralelo) no aborta el lote. El caller puede re-ejecutar.
        continue;
      }
    }
    return { archived: archived.length, orderIds: archived };
  }

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
      .select({
        id: schema.states.id,
        name: schema.states.name,
        marksAsDelivered: schema.states.marksAsDelivered,
      })
      .from(schema.states)
      .where(and(eq(schema.states.id, newStateId), isNull(schema.states.deletedAt)))
      .limit(1);
    const newState = stateRows[0];
    if (!newState) throw new ConflictError('Estado inexistente o eliminado');

    const updates: { stateId: number; returnedAt?: string } = { stateId: newStateId };
    if (newState.marksAsDelivered === 1 && !order.returnedAt) {
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
