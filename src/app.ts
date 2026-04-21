import express from 'express';
import { createV2Router } from './v2';

/**
 * Minimal Express app wrapping the v2 router at /api/v2. Used by src/main.ts
 * for standalone runs and by tests (supertest). Production deploy reuses
 * createV2Router directly from the legacy index.js to coexist with the
 * legacy /api/* routes.
 */
export function createApp(): express.Express {
  const app = express();
  app.use('/api/v2', createV2Router());
  return app;
}
