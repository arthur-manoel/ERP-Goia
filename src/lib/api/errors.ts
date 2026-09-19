export class HttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); this.name = new.target.name; }
}
export class ValidationError extends HttpError {
  constructor(message: string) { super(400, message); }
}
export class NotFoundError extends HttpError {
  constructor(message = "Registro não encontrado.") { super(404, message); }
}
export class ConflictError extends HttpError {
  constructor(message: string) { super(409, message); }
}
