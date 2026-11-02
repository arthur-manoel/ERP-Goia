import "server-only"
import { createHash } from "node:crypto"
import { Prisma } from "@/generated/prisma/client"
import {
  ProducaoError,
  type Contexto,
  type Transaction,
} from "./producao.repository"

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex")
export function identidadeConfirmacao(
  ctx: Contexto,
  ordem: number,
  item: number,
  produzida: string,
  esperada: string,
  chave?: string,
) {
  if (chave !== undefined && !/^[\x21-\x7e]{8,128}$/.test(chave))
    throw new ProducaoError(
      400,
      "Idempotency-Key deve ter de 8 a 128 caracteres ASCII sem espaços.",
    )
  const requisicao = hash({
    autor: ctx.idUsuario,
    ordem,
    item,
    produzida: new Prisma.Decimal(produzida).toFixed(3),
    esperada: new Prisma.Decimal(esperada).toFixed(3),
  })
  return { chave: chave ?? `final:${requisicao}`, requisicao }
}
type Fato = {
  id: number
  id_setor: number
  quantidade_produzida: Prisma.Decimal
  quantidade_perdida: Prisma.Decimal
  substituicao: number | null
  evento: number | null
  registro: number | null
  confirmacao: number | null
}
// O chamador já mantém os locks de empresa e OP. Todas as consultas usam o mesmo tx.
export async function fonteProducao(
  tx: Transaction,
  ordem: number,
  item: number,
  setor: number | null,
  projecao: Prisma.Decimal,
) {
  const fatos = await tx.$queryRaw<Fato[]>`
    SELECT a.id,a.id_setor,a.quantidade_produzida,a.quantidade_perdida,
      substituicao.id AS substituicao,evento.id AS evento,
      CASE WHEN evento.tipo='REGISTRO' THEN evento.id ELSE NULL END AS registro,
      c.id AS confirmacao
    FROM ordem_producao_apontamento a
    LEFT JOIN producao_apontamento_evento substituicao ON substituicao.id_apontamento_anterior=a.id
    LEFT JOIN producao_apontamento_evento evento ON evento.id_apontamento_novo=a.id
    LEFT JOIN producao_confirmacao c ON c.id_apontamento_novo=a.id
    WHERE a.id_ordem_producao=${ordem} AND a.id_ordem_producao_item=${item} ORDER BY a.id`
  const finais = fatos.filter((f) => f.id_setor === setor)
  const validos = finais.filter((f) => f.substituicao === null)
  const total = validos.reduce(
    (s, f) => s.plus(f.quantidade_produzida),
    new Prisma.Decimal(0),
  )
  return {
    total,
    detalhado: finais.some((f) => f.registro !== null),
    manual: finais.some((f) => f.confirmacao !== null),
    semOrigem: validos.some((f) => f.evento === null && f.confirmacao === null),
    temDetalhamento: fatos.some((f) => f.registro !== null),
    hash: hash({
      projecao: projecao.toFixed(3),
      fatos: fatos.map((f) => ({
        id: f.id,
        id_setor: f.id_setor,
        substituicao: f.substituicao,
        evento: f.evento,
        quantidade_produzida: f.quantidade_produzida.toFixed(3),
        quantidade_perdida: f.quantidade_perdida.toFixed(3),
      })),
    }),
  }
}
export function validarProjecao(
  antes: Prisma.Decimal,
  fonte: Prisma.Decimal,
  depois: Prisma.Decimal,
) {
  // Zero é a projeção não preenchida pela API de apontamentos anterior a esta revisão.
  // Outro legado divergente precisa de reconciliação explícita; não apagar produção.
  if (!antes.eq(fonte) && !antes.isZero() && !antes.eq(depois))
    throw new ProducaoError(
      409,
      "Total do item diverge dos apontamentos. Reconcilie os registros históricos antes de continuar.",
    )
}
export async function protegerEfeitosFisicos(
  tx: Transaction,
  ctx: Contexto,
  ordem: number,
  status: string,
) {
  const efeitos = await tx.movimentacao_estoque.findFirst({
    where: {
      id_empresa: ctx.idEmpresa,
      origem_id: ordem,
      origem_tipo: { in: ["ORDEM_PRODUCAO", "PRODUCAO", "CONSUMO_PRODUCAO"] },
    },
    select: { id: true },
  })
  if (status === "CONCLUIDA" || efeitos)
    throw new ProducaoError(
      409,
      "Produção encerrada ou com efeitos físicos confirmados. Regularize pelo processo de compensação antes de alterar os totais.",
    )
}
export async function confirmacaoPorChave(
  tx: Transaction,
  empresa: number,
  chave: string,
) {
  const rows = await tx.$queryRaw<
    Array<{
      id: number
      id_usuario: number
      hash_requisicao: string
      hash_estado: string
    }>
  >`
    SELECT id,id_usuario,hash_requisicao,hash_estado FROM producao_confirmacao WHERE id_empresa=${empresa} AND chave_idempotencia=${chave}`
  return rows[0]
}
export async function registrarConfirmacao(
  tx: Transaction,
  ctx: Contexto,
  ordem: number,
  item: number,
  setor: number | null,
  identidade: ReturnType<typeof identidadeConfirmacao>,
  estado: string,
  tipo: "REGISTRO" | "CONFIRMACAO" | "LEGADO",
  total: Prisma.Decimal,
  esperada: string,
  apontamento: number | null,
) {
  await tx.$executeRaw`INSERT INTO producao_confirmacao(id_empresa,id_ordem_producao,id_ordem_producao_item,id_setor,id_usuario,chave_idempotencia,hash_requisicao,hash_estado,tipo,quantidade_produzida,quantidade_esperada,id_apontamento_novo) VALUES(${ctx.idEmpresa},${ordem},${item},${setor},${ctx.idUsuario},${identidade.chave},${identidade.requisicao},${estado},${tipo},${total},${esperada},${apontamento})`
}
