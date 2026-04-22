import { and, eq, inArray, sql } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../db/schema';
import { ConflictError, NotFoundError } from '../../domain/errors';

export interface RepuestoDetail {
  id: number;
  name: string;
  cantidadLimite: number;
  colorId: number | null;
  nombreRepuestosId: number | null;
  calidadRepuestosId: number | null;
  almacenamientoRepuestosId: number | null;
  venta: boolean;
  precioVentaSugerido: number | null;
  deviceIds: number[];
}

export interface CreateRepuestoInput {
  name: string;
  cantidadLimite?: number;
  colorId?: number | null;
  nombreRepuestosId?: number | null;
  calidadRepuestosId?: number | null;
  almacenamientoRepuestosId?: number | null;
  venta?: boolean;
  precioVentaSugerido?: number | null;
  deviceIds?: number[];
}

export interface UpdateRepuestoInput {
  name?: string;
  cantidadLimite?: number;
  colorId?: number | null;
  nombreRepuestosId?: number | null;
  calidadRepuestosId?: number | null;
  almacenamientoRepuestosId?: number | null;
  venta?: boolean;
  precioVentaSugerido?: number | null;
  deviceIds?: number[];
}

function isDuplicateError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'ER_DUP_ENTRY'
  );
}

/**
 * Toma la fila cruda del DB + el array de devices y la mapea a RepuestoDetail,
 * convirtiendo DECIMAL (que mysql2 devuelve como string) a number y
 * tinyint a boolean.
 */
function toDetail(
  row: typeof schema.repuestos.$inferSelect,
  deviceIds: number[],
): RepuestoDetail {
  return {
    id: row.id,
    name: row.name,
    cantidadLimite: row.cantidadLimite,
    colorId: row.colorId,
    nombreRepuestosId: row.nombreRepuestosId,
    calidadRepuestosId: row.calidadRepuestosId,
    almacenamientoRepuestosId: row.almacenamientoRepuestosId,
    venta: row.venta === 1,
    precioVentaSugerido:
      row.precioVentaSugerido !== null && row.precioVentaSugerido !== undefined
        ? parseFloat(row.precioVentaSugerido)
        : null,
    deviceIds,
  };
}

export class RepuestoRepository {
  constructor(private readonly db: MySql2Database<typeof schema>) {}

  async list(): Promise<RepuestoDetail[]> {
    const rows = await this.db
      .select()
      .from(schema.repuestos)
      .where(eq(schema.repuestos.mostrar, 1))
      .orderBy(schema.repuestos.name);
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const assocs = await this.db
      .select()
      .from(schema.repuestosDevices)
      .where(inArray(schema.repuestosDevices.repuestosId, ids));

    const devicesByRepuesto = new Map<number, number[]>();
    for (const a of assocs) {
      const list = devicesByRepuesto.get(a.repuestosId) ?? [];
      list.push(a.devicesId);
      devicesByRepuesto.set(a.repuestosId, list);
    }

    return rows.map((r) => toDetail(r, devicesByRepuesto.get(r.id) ?? []));
  }

  async findById(id: number): Promise<RepuestoDetail | null> {
    const rows = await this.db
      .select()
      .from(schema.repuestos)
      .where(and(eq(schema.repuestos.id, id), eq(schema.repuestos.mostrar, 1)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;

    const assocs = await this.db
      .select({ deviceId: schema.repuestosDevices.devicesId })
      .from(schema.repuestosDevices)
      .where(eq(schema.repuestosDevices.repuestosId, id));

    return toDetail(row, assocs.map((a) => a.deviceId));
  }

  async create(input: CreateRepuestoInput): Promise<RepuestoDetail> {
    const deviceIds = input.deviceIds ?? [];

    let newId = 0;
    try {
      await this.db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(schema.repuestos)
          .values({
            name: input.name,
            cantidadLimite: input.cantidadLimite ?? 0,
            colorId: input.colorId ?? null,
            nombreRepuestosId: input.nombreRepuestosId ?? null,
            calidadRepuestosId: input.calidadRepuestosId ?? null,
            almacenamientoRepuestosId: input.almacenamientoRepuestosId ?? null,
            venta: input.venta === true ? 1 : 0,
            precioVentaSugerido:
              input.precioVentaSugerido !== undefined && input.precioVentaSugerido !== null
                ? input.precioVentaSugerido.toFixed(2)
                : null,
          })
          .$returningId();
        newId = inserted.id;

        if (deviceIds.length > 0) {
          await tx
            .insert(schema.repuestosDevices)
            .values(deviceIds.map((d) => ({ repuestosId: newId, devicesId: d })));
        }
      });
    } catch (err) {
      if (isDuplicateError(err)) {
        throw new ConflictError(`Ya existe un repuesto con nombre "${input.name}"`);
      }
      throw err;
    }

    const created = await this.findById(newId);
    if (!created) throw new NotFoundError('Repuesto');
    return created;
  }

  async update(id: number, input: UpdateRepuestoInput): Promise<RepuestoDetail> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError('Repuesto');

    const patch: Partial<typeof schema.repuestos.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.cantidadLimite !== undefined) patch.cantidadLimite = input.cantidadLimite;
    if (input.colorId !== undefined) patch.colorId = input.colorId;
    if (input.nombreRepuestosId !== undefined) patch.nombreRepuestosId = input.nombreRepuestosId;
    if (input.calidadRepuestosId !== undefined) patch.calidadRepuestosId = input.calidadRepuestosId;
    if (input.almacenamientoRepuestosId !== undefined)
      patch.almacenamientoRepuestosId = input.almacenamientoRepuestosId;
    if (input.venta !== undefined) patch.venta = input.venta === true ? 1 : 0;
    if (input.precioVentaSugerido !== undefined) {
      patch.precioVentaSugerido =
        input.precioVentaSugerido !== null ? input.precioVentaSugerido.toFixed(2) : null;
    }

    try {
      await this.db.transaction(async (tx) => {
        if (Object.keys(patch).length > 0) {
          await tx.update(schema.repuestos).set(patch).where(eq(schema.repuestos.id, id));
        }

        // Si deviceIds vino en el body, reemplazamos el set completo de asociaciones.
        // Si NO vino (undefined), preservamos las existentes — coherente con la
        // semántica de PATCH.
        if (input.deviceIds !== undefined) {
          await tx
            .delete(schema.repuestosDevices)
            .where(eq(schema.repuestosDevices.repuestosId, id));
          if (input.deviceIds.length > 0) {
            await tx
              .insert(schema.repuestosDevices)
              .values(input.deviceIds.map((d) => ({ repuestosId: id, devicesId: d })));
          }
        }
      });
    } catch (err) {
      if (isDuplicateError(err)) {
        throw new ConflictError(`Ya existe un repuesto con ese nombre`);
      }
      throw err;
    }

    const updated = await this.findById(id);
    if (!updated) throw new NotFoundError('Repuesto');
    return updated;
  }

  async softDelete(id: number): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundError('Repuesto');

    // Bloquear el soft-delete si hay stock activo con cantidad_restante > 0.
    // El repuesto sigue siendo referenciable históricamente pero ya no
    // aparece en la UI. Si hay stock activo, el admin tiene que consumirlo
    // o transferirlo primero para que el soft-delete no deje productos huérfanos.
    const result = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.stockbranch)
      .innerJoin(schema.stock, eq(schema.stock.id, schema.stockbranch.stockId))
      .where(and(eq(schema.stock.repuestoId, id), sql`${schema.stockbranch.cantidadRestante} > 0`));
    const count = Number(result[0]?.count ?? 0);
    if (count > 0) {
      throw new ConflictError(
        `El repuesto tiene stock activo en ${count} sucursal(es). Consumir o transferir antes de eliminar.`,
      );
    }

    await this.db
      .update(schema.repuestos)
      .set({ mostrar: 0 })
      .where(eq(schema.repuestos.id, id));
  }
}
