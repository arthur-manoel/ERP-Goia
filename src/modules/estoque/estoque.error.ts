export class EstoqueError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = "EstoqueError"
  }
}
