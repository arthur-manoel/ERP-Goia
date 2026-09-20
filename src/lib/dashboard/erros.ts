/** A consulta real deste indicador ainda não foi implementada. */
export class IndicadorNaoIntegradoError extends Error {
  constructor(indicador: string) {
    super(`Indicador "${indicador}" ainda não integrado ao banco.`)
    this.name = "IndicadorNaoIntegradoError"
  }
}

/** O usuário da sessão não pode ver o indicador. */
export class SemPermissaoError extends Error {
  constructor() {
    super("Sem permissão para este indicador.")
    this.name = "SemPermissaoError"
  }
}
