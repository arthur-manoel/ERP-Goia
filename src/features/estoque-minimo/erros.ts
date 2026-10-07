export class EstoqueMinimoError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
