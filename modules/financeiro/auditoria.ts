import { createHash } from "node:crypto"
import type { Prisma } from "../../src/generated/prisma/client"

export type FinancialActor = { idUsuario: number }
export type FinancialEvent =
  "CRIACAO" | "EDICAO" | "CANCELAMENTO" | "BAIXA" | "RECONCILIACAO"
type RecordSnapshot = { id: number; id_empresa: number }

function snapshot(record: RecordSnapshot, event: FinancialEvent) {
  return JSON.stringify(
    { ...record, evento_financeiro: event },
    (key, value: unknown) => {
      // A tabela de auditoria usa TEXT. Notas longas são identificadas por hash,
      // sem truncar o dado original no registro financeiro nem estourar o log.
      if (
        key === "observacao" &&
        typeof value === "string" &&
        Buffer.byteLength(value, "utf8") > 8192
      )
        return {
          bytes: Buffer.byteLength(value, "utf8"),
          sha256: createHash("sha256").update(value).digest("hex"),
        }
      return value
    },
  )
}

/** Mesmo padrão dos repositories de clientes/pedidos: snapshot antes/depois,
 * autor do JWT e INSERT/UPDATE, obrigatoriamente no TransactionClient da escrita.
 * Cancelamento lógico é UPDATE, distinguido no evento do snapshot.
 */
export function auditFinancial(
  database: Prisma.TransactionClient,
  actor: FinancialActor,
  table: "despesas" | "contas_pagar" | "contas_receber",
  before: RecordSnapshot | null,
  after: RecordSnapshot,
  event: FinancialEvent,
) {
  return database.auditoria.create({
    data: {
      id_empresa: after.id_empresa,
      id_usuario: actor.idUsuario,
      tabela: table,
      id_registro: after.id,
      acao: before ? "UPDATE" : "INSERT",
      dados_anteriores: before ? snapshot(before, event) : null,
      dados_novos: snapshot(after, event),
    },
  })
}
