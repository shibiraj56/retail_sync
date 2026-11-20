import { HttpsError, FunctionsErrorCode } from 'firebase-functions/v2/https';

export class AppError extends Error {
  public code: FunctionsErrorCode;

  constructor(code: FunctionsErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }

  toHttpsError(): HttpsError {
    return new HttpsError(this.code, this.message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'User is not authenticated') {
    super('unauthenticated', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'User does not have permission to perform this action') {
    super('permission-denied', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Requested resource not found') {
    super('not-found', message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource state conflict') {
    super('already-exists', message);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid input parameters') {
    super('invalid-argument', message);
  }
}

export function handleFunctionError(error: unknown): never {
  if (error instanceof AppError) {
    throw error.toHttpsError();
  }
  if (error instanceof HttpsError) {
    throw error;
  }
  if (error instanceof Error) {
    console.error('Unhandled server error:', error);
    throw new HttpsError('internal', error.message || 'An unexpected internal error occurred');
  }
  throw new HttpsError('internal', 'An unknown error occurred');
}
