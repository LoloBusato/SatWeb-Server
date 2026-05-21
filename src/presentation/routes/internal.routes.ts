import { Router } from 'express';
import { env } from '../../config/env';
import { UnauthorizedError } from '../../domain/errors';
import type { OrderRepository } from '../../infrastructure/repositories/OrderRepository';
import type { UserRepository } from '../../infrastructure/repositories/UserRepository';

/**
 * Endpoints internos, sin JWT auth. Autenticación vía Bearer del
 * CRON_SECRET (env var que Vercel Cron inyecta automáticamente cuando
 * está configurada). Vercel manda GET por default; respetamos eso en
 * archive-overdue-tick aunque semánticamente sea una mutación.
 *
 * Si CRON_SECRET no está seteada en el entorno, los endpoints
 * responden 503 para dejar obvio que falta configuración.
 */
export function internalRouter(
  orderRepo: OrderRepository,
  userRepo: UserRepository,
): Router {
  const r = Router();

  r.get('/archive-overdue-tick', async (req, res, next) => {
    try {
      if (!env.CRON_SECRET) {
        return res.status(503).json({
          error: { code: 'not_configured', message: 'CRON_SECRET is not set' },
        });
      }
      const header = req.headers.authorization;
      if (!header || header !== `Bearer ${env.CRON_SECRET}`) {
        throw new UnauthorizedError('Invalid cron secret');
      }

      const systemUser = await userRepo.findByUsername('system');
      if (!systemUser) {
        return res.status(500).json({
          error: {
            code: 'internal',
            message: 'system user not found (check migration 0010)',
          },
        });
      }

      // Paso 1: archivar REPARADO CLIENTE AVISADO → INCUCAI a partir de
      // los días configurados por sucursal (existente).
      const archived = await orderRepo.archiveOverdue(null, systemUser.id);
      // Paso 2: orfanar (users_id = NULL) las órdenes que llevan ≥
      // incucai_after_days en INCUCAI — agregado en mayo 2026 para
      // representar "Propiedad de TheDoniPhone" en el tab INCUCAI del
      // home admin. Idempotente (filtra por users_id IS NOT NULL).
      const orphaned = await orderRepo.orphanIncucaiOverdue();
      // Paso 3: archivar repuestos de órdenes entregadas hace > 6 meses
      // (mayo 2026). Convierte cada conjunto de filas reducestock en un
      // mensaje "[Archivo] Repuestos usados: ..." y borra las filas.
      // Idempotente (filtra por EXISTS reducestock).
      const archivedRepuestos = await orderRepo.archiveOldRepuestos();

      req.log?.info(
        {
          archived: archived.archived,
          archivedIds: archived.orderIds,
          orphaned: orphaned.orphaned,
          orphanedIds: orphaned.orderIds,
          archivedRepuestos: archivedRepuestos.archived,
          messagesInserted: archivedRepuestos.messagesInserted,
          reducestockDeleted: archivedRepuestos.reducestockDeleted,
        },
        'cron: archive-overdue-tick executed',
      );
      res.json({ archived, orphaned, archivedRepuestos });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
