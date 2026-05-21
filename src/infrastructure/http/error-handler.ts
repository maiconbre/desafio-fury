import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError, ValidationError, badRequest, internal, notFound, conflict } from '../../domain/errors/app-error.js'

const ERROR_MAP: Record<number, (msg: string) => ReturnType<typeof internal>> = {
  400: (m) => badRequest(m),
  404: (m) => notFound(m),
  409: (m) => conflict(m),
}

export function errorHandler(error: unknown, _request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    if (error instanceof ValidationError) {
      return reply.status(error.statusCode).send(badRequest(error.message, error.details))
    }
    const format = ERROR_MAP[error.statusCode]
    const response = format ? format(error.message) : internal(error.message)
    return reply.status(error.statusCode).send(response)
  }

  return reply.status(500).send(internal('An unexpected error occurred'))
}
