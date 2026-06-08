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

      // Paso 4 (junio 2026): generar instancias de tareas repetitivas para
      // las próximas 24h Y cleanup de las viejas. Delega al backend legacy
      // llamando a dos endpoints — los dos viven en el pool MySQL nativo
      // y comparten la lógica de schema. Loggeamos cada paso con timestamp
      // y body para que el próximo cron deje rastro visible en los logs
      // de Vercel aunque el tier Hobby los purgue rápido — al menos durante
      // la ventana de retención queda evidencia de qué pasó.
      let tasksTick: { instances_created: number } | null = null;
      let tasksCleanup: { deleted: number } | null = null;
      const t0 = Date.now();
      const selfBase = process.env.SELF_BASE_URL ?? '';
      console.log('[cron-tasks] start', new Date().toISOString(), 'selfBase:', selfBase || '(VACÍO)');
      try {
        if (!selfBase) {
          console.warn('[cron-tasks] SKIP: SELF_BASE_URL no está seteada en env. Las tareas no se generarán.');
        } else {
          const tickUrl = `${selfBase}/api/tasks/internal/tasks-tick`;
          console.log('[cron-tasks] POST', tickUrl);
          const respTick = await fetch(tickUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
          });
          const tickText = await respTick.text();
          console.log('[cron-tasks] tasks-tick ←', respTick.status, '|', tickText.slice(0, 500));
          if (respTick.ok) {
            try { tasksTick = JSON.parse(tickText) as { instances_created: number }; } catch (_) {}
          }

          const cleanUrl = `${selfBase}/api/task-instances/internal/tasks-cleanup`;
          console.log('[cron-tasks] POST', cleanUrl);
          const respClean = await fetch(cleanUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
          });
          const cleanText = await respClean.text();
          console.log('[cron-tasks] tasks-cleanup ←', respClean.status, '|', cleanText.slice(0, 500));
          if (respClean.ok) {
            try { tasksCleanup = JSON.parse(cleanText) as { deleted: number }; } catch (_) {}
          }
        }
      } catch (err) {
        console.error('[cron-tasks] ERROR', (err as Error).message, (err as Error).stack);
        req.log?.warn({ err }, 'tasks-tick/cleanup fallback failed (no es bloqueante)');
      }
      console.log('[cron-tasks] done in', Date.now() - t0, 'ms', 'tasksTick:', tasksTick, 'tasksCleanup:', tasksCleanup);

      req.log?.info(
        {
          archived: archived.archived,
          archivedIds: archived.orderIds,
          orphaned: orphaned.orphaned,
          orphanedIds: orphaned.orderIds,
          archivedRepuestos: archivedRepuestos.archived,
          messagesInserted: archivedRepuestos.messagesInserted,
          reducestockDeleted: archivedRepuestos.reducestockDeleted,
          tasksInstancesCreated: tasksTick?.instances_created ?? null,
          tasksInstancesDeleted: tasksCleanup?.deleted ?? null,
        },
        'cron: archive-overdue-tick executed',
      );
      res.json({ archived, orphaned, archivedRepuestos, tasksTick, tasksCleanup });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
