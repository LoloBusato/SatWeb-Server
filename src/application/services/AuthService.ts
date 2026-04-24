import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import {
  InvalidCredentialsError,
  UnauthorizedError,
  UserDisabledError,
} from '../../domain/errors';
import {
  isBcryptHash,
  isUserActive,
  isUserEnabled,
  toPublicUser,
  type PublicUser,
} from '../../domain/entities/User';
import type { UserRepository } from '../../infrastructure/repositories/UserRepository';
import type { PermissionRepository } from '../../infrastructure/repositories/PermissionRepository';

export interface SessionPayload {
  sub: number;
  username: string;
  branchId: number;
  groupId: number;
  permissions: string[];
  iat?: number;
  exp?: number;
}

export interface LoginResult {
  token: string;
  user: PublicUser;
  permissions: string[];
}

export class AuthService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly permRepo: PermissionRepository,
  ) {}

  async login(username: string, plaintext: string): Promise<LoginResult> {
    const user = await this.userRepo.findByUsername(username);
    if (!user || !isUserActive(user)) {
      throw new InvalidCredentialsError();
    }

    const stored = user.passwordHash;
    let ok: boolean;

    if (isBcryptHash(stored)) {
      ok = await bcrypt.compare(plaintext, stored);
    } else {
      if (!env.ALLOW_LEGACY_PASSWORD_MIGRATION) {
        throw new InvalidCredentialsError();
      }
      ok = stored === plaintext;
      if (ok) {
        const newHash = await bcrypt.hash(plaintext, env.BCRYPT_ROUNDS);
        await this.userRepo.updatePasswordHash(user.id, newHash);
        logger.info(
          { userId: user.id, username: user.username },
          'legacy password migrated to bcrypt',
        );
      }
    }

    if (!ok) throw new InvalidCredentialsError();

    // Chequeamos `enabled` DESPUÉS de validar el password para no filtrar
    // enumeración de users deshabilitados. Un atacante sin las credenciales
    // recibe InvalidCredentialsError igual que con un user inexistente.
    if (!isUserEnabled(user)) {
      throw new UserDisabledError();
    }

    const permissions = await this.permRepo.listCodesByGroupId(user.groupId);

    const payload: SessionPayload = {
      sub: user.id,
      username: user.username,
      branchId: user.branchId,
      groupId: user.groupId,
      permissions,
    };

    const signOptions = { expiresIn: env.JWT_EXPIRES_IN } as SignOptions;
    const token = jwt.sign(payload, env.JWT_SECRET, signOptions);

    return { token, user: toPublicUser(user), permissions };
  }

  async hashPassword(plaintext: string): Promise<string> {
    return bcrypt.hash(plaintext, env.BCRYPT_ROUNDS);
  }

  async changePassword(
    userId: number,
    oldPlaintext: string,
    newPlaintext: string,
  ): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user || !isUserActive(user)) throw new UnauthorizedError();
    if (!isUserEnabled(user)) throw new UserDisabledError();

    const ok = isBcryptHash(user.passwordHash)
      ? await bcrypt.compare(oldPlaintext, user.passwordHash)
      : user.passwordHash === oldPlaintext;

    if (!ok) throw new InvalidCredentialsError();

    const newHash = await bcrypt.hash(newPlaintext, env.BCRYPT_ROUNDS);
    await this.userRepo.updatePasswordHash(userId, newHash);
  }

  verifyToken(token: string): SessionPayload {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET);
      if (typeof decoded === 'string') {
        throw new UnauthorizedError('Token inválido');
      }
      return decoded as unknown as SessionPayload;
    } catch {
      throw new UnauthorizedError('Token inválido o expirado');
    }
  }
}
