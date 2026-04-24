export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;

  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class InvalidCredentialsError extends DomainError {
  readonly code = 'invalid_credentials';
  readonly httpStatus = 401;
  constructor() {
    super('Credenciales inválidas');
  }
}

export class UnauthorizedError extends DomainError {
  readonly code = 'unauthorized';
  readonly httpStatus = 401;
  constructor(message = 'No autenticado') {
    super(message);
  }
}

export class ForbiddenError extends DomainError {
  readonly code = 'forbidden';
  readonly httpStatus = 403;
  constructor(message = 'No autorizado') {
    super(message);
  }
}

export class UserDisabledError extends DomainError {
  readonly code = 'user_disabled';
  readonly httpStatus = 403;
  constructor(message = 'Usuario deshabilitado. Contactá al administrador.') {
    super(message);
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'not_found';
  readonly httpStatus = 404;
  constructor(resource: string) {
    super(`${resource} no encontrado`);
  }
}

export class ConflictError extends DomainError {
  readonly code = 'conflict';
  readonly httpStatus = 409;
  constructor(message: string, details?: unknown) {
    super(message, details);
  }
}

export class ValidationError extends DomainError {
  readonly code = 'validation';
  readonly httpStatus = 400;
  constructor(message: string, details?: unknown) {
    super(message, details);
  }
}
