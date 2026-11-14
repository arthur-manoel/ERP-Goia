import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { ConflictError, ValidationError } from "./api/errors"

/** Formatos atuais, preservados inclusive para números acima de seis dígitos.
 * Pedido de cliente, venda e ordem de produção usam o decimal sem prefixo.
 * Compras usam CP-000001, pedidos legados de compra PC-000001 e requisições SC-000001.
 * Nota fiscal reserva uma sequência decimal para uso futuro. O número de uma nota
 * de fornecedor continua sendo informado pelo documento, sem geração automática.
 */
const prefixos = {
  pedido_cliente: "",
  ordem_producao: "",
  venda: "",
  compras: "CP",
  pedido_compra: "PC",
  requisicao_compra: "SC",
  nota_fiscal: "",
} as const

export type EntidadeNumerada = keyof typeof prefixos
type ContextoEmpresa = { idEmpresa: number }
const maximo = BigInt("18446744073709551615")

export function formatarNumero(entidade: EntidadeNumerada, numero: bigint) {
  if (!Object.hasOwn(prefixos, entidade))
    throw new ValidationError("Entidade de numeração inválida.")
  const prefixo = prefixos[entidade]
  return prefixo
    ? `${prefixo}-${numero.toString().padStart(6, "0")}`
    : numero.toString()
}

/** O contexto vem do autorizador do módulo, nunca do corpo da requisição.
 * O TransactionClient não carrega a empresa, por isso ela é explícita.
 * A transação do chamador deve abranger também a criação do documento.
 * O INSERT nativo cria ou bloqueia a linha pela PK composta, inclusive na
 * primeira geração concorrente. O lock permanece até commit ou rollback.
 * Conflitos transitórios devem ser tratados repetindo a transação inteira no
 * chamador. Este serviço não abre transações nem repete escritas isoladas.
 */
export async function proximoNumero(
  tx: Prisma.TransactionClient,
  entidade: EntidadeNumerada,
  { idEmpresa }: ContextoEmpresa,
): Promise<string> {
  if (
    !Number.isSafeInteger(idEmpresa) ||
    idEmpresa <= 0 ||
    idEmpresa > 2147483647
  )
    throw new ValidationError("Empresa inválida para numeração.")
  if (!Object.hasOwn(prefixos, entidade))
    throw new ValidationError("Entidade de numeração inválida.")

  await tx.$executeRaw`
    INSERT INTO sequencias_automaticas (id_empresa, entidade, ultimo_numero)
    VALUES (${idEmpresa}, ${entidade}, 0)
    ON DUPLICATE KEY UPDATE ultimo_numero = ultimo_numero
  `
  // Locking read evita reutilizar um snapshot antigo em RepeatableRead.
  const [sequencia] = await tx.$queryRaw<Array<{ ultimo: string }>>`
    SELECT CAST(ultimo_numero AS CHAR) AS ultimo FROM sequencias_automaticas
    WHERE id_empresa = ${idEmpresa} AND entidade = ${entidade} FOR UPDATE
  `
  let ultimo = BigInt(sequencia.ultimo)

  // Preserva a regularização de pedidos/vendas legados e a aplica também às
  // ordens numéricas. Identificadores SQL são constantes internas permitidas.
  const tabelas = {
    pedido_cliente: Prisma.sql`pedido_cliente`,
    venda: Prisma.sql`venda`,
    ordem_producao: Prisma.sql`ordem_producao`,
  }
  if (Object.hasOwn(tabelas, entidade)) {
    const tabela = tabelas[entidade as keyof typeof tabelas]
    const [legado] = await tx.$queryRaw<Array<{ maior: string }>>(Prisma.sql`
      SELECT numero AS maior FROM ${tabela}
      WHERE id_empresa = ${idEmpresa} AND numero REGEXP '^[1-9][0-9]{0,19}$'
      ORDER BY CAST(numero AS UNSIGNED) DESC LIMIT 1 FOR UPDATE
    `)
    if (legado && BigInt(legado.maior) > ultimo) ultimo = BigInt(legado.maior)
  }
  if (ultimo >= maximo) throw new ConflictError("Numeração esgotada.")
  const sequenciaAtualizada = await tx.sequencias_automaticas.update({
    where: { id_empresa_entidade: { id_empresa: idEmpresa, entidade } },
    data: { ultimo_numero: ultimo + BigInt(1) },
    select: { ultimo_numero: true },
  })
  return formatarNumero(entidade, sequenciaAtualizada.ultimo_numero)
}
