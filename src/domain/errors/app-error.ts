export interface ErrorResponse {
  error: string
  message: string
  details?: unknown
}

export class AppError extends Error {
  public readonly statusCode: number
  public readonly details?: unknown

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message)
    this.statusCode = statusCode
    this.details = details
    this.name = 'AppError'
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, message, details)
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, message)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message)
    this.name = 'ConflictError'
  }
}

export class ExternalApiError extends AppError {
  constructor(message: string, details?: unknown) {
    super(502, message, details) // 502 Bad Gateway
    this.name = 'ExternalApiError'
  }
}

export function badRequest(message: string, details?: unknown): ErrorResponse {
  return { error: 'Bad request', message, details }
}

export function notFound(message: string): ErrorResponse {
  return { error: 'Not found', message }
}

export function conflict(message: string): ErrorResponse {
  return { error: 'Conflict', message }
}

export function internal(message: string): ErrorResponse {
  return { error: 'Internal server error', message }
}
