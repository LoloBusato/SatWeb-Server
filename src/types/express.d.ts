import type { SessionPayload } from '../application/services/AuthService';

declare global {
  namespace Express {
    interface Request {
      user?: SessionPayload;
      branchFilter?: number | null;
    }
  }
}

export {};
