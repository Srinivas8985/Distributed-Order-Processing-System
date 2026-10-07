export class ApplicationError extends Error {
  public code: string;
  public status: number;

  constructor(code: string, message: string, status: number = 500) {
    super(message);
    this.code = code;
    this.status = status;
    Object.setPrototypeOf(this, ApplicationError.prototype);
  }
}

export class NotFoundError extends ApplicationError {
  constructor(message: string = 'Resource not found') {
    super('ORDER_NOT_FOUND', message, 404);
  }
}

export class ConflictError extends ApplicationError {
  constructor(message: string = 'Conflict') {
    super('ORDER_CONFLICT', message, 409);
  }
}

export class ServiceUnavailableError extends ApplicationError {
  constructor(message: string = 'Service unavailable') {
    super('USER_SERVICE_UNAVAILABLE', message, 503);
  }
}
