import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import {
  ProducaoError,
  type Contexto,
  type Transaction,
} from "@/modules/producao/producao.repository"
import { disputaPersistencia } from "@/lib/prisma-concorrencia"
import type { Etapa, Total } from "./apontamentos.regras"

export type Evento = {
  id: number
  id_empresa: number
  id_ordem_producao: number
  id_etapa: number
  id_ordem_producao_item: number
  id_setor: number
  id_usuario: number
  chave_idempotencia: string
  hash_requisicao: string
  tipo: "REGISTRO" | "CORRECAO" | "ESTORNO"
  id_apontamento_novo: number | null
  id_apontamento_anterior: number | null
  motivo: string | null
  data_cadastro: Date
}
export type Apontamento = {
  id: number
  id_ordem_producao: number
  id_ordem_producao_item: number
  id_setor: number
  id_usuario: number
  data_apontamento: Date
  quantidade_produzida: Prisma.Decimal
  quantidade_perdida: Prisma.Decimal
  motivo_perda: string | null
  data_cadastro: Date
  substituido: number | null
}
export async function escrita<T>(
  ctx: Contexto,
  id: number,
  operacao: (
    tx: Transaction,
    ordem: { id: number; status: string },
  ) => Promise<T>,
) {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM empresas WHERE id=${ctx.idEmpresa} AND status='ATIVA' FOR UPDATE`
          const vinculo = await tx.usuario_empresa.findFirst({
            where: {
              id_usuario: ctx.idUsuario,
              id_empresa: ctx.idEmpresa,
              status: "ATIVO",
              usuarios: { status: "ATIVO" },
              empresas: { status: "ATIVA" },
            },
            include: {
              usuarios: { select: { nivel_acesso: true } },
              permissoes_usuario: true,
            },
          })
          if (
            !vinculo ||
            !(
              vinculo.nivel_acesso === "EMPRESA" ||
              vinculo.usuarios.nivel_acesso === "ADMIN" ||
              vinculo.permissoes_usuario.some(
                (p) => p.recurso === "ORDENS_PRODUCAO" && p.pode_editar,
              )
            )
          )
            throw new ProducaoError(
              403,
              "Sem permissão de edição da produção nesta empresa.",
            )
          const ordens = await tx.$queryRaw<
            Array<{ id: number; status: string }>
          >`SELECT id,status FROM ordem_producao WHERE id=${id} AND id_empresa=${ctx.idEmpresa} FOR UPDATE`
          if (!ordens[0]) throw new ProducaoError(404, "Ordem não encontrada.")
          return operacao(tx, ordens[0])
        },
        { isolationLevel: "Serializable", timeout: 15000 },
      )
    } catch (error) {
      if (disputaPersistencia(error)) {
        if (tentativa < 2) continue
        throw new ProducaoError(
          409,
          "Conflito concorrente; repita a mesma chave de idempotência.",
        )
      }
      throw error
    }
  }
  throw new ProducaoError(409, "Conflito de apontamento.")
}
export const leitura = <T>(operation: (tx: Transaction) => Promise<T>) =>
  prisma.$transaction(operation, { isolationLevel: "RepeatableRead" })
export async function etapas(tx: Transaction, id: number) {
  return tx.$queryRaw<
    Etapa[]
  >`SELECT id,id_setor,ordem,status,data_inicio FROM ordem_producao_fluxo_setor WHERE id_ordem_producao=${id} ORDER BY ordem,id`
}
export async function eventoPorChave(
  tx: Transaction,
  empresa: number,
  chave: string,
) {
  const rows = await tx.$queryRaw<
    Evento[]
  >`SELECT * FROM producao_apontamento_evento WHERE id_empresa=${empresa} AND chave_idempotencia=${chave}`
  return rows[0]
}
export async function apontamentos(
  tx: Transaction,
  id: number,
  page: number,
  limit: number,
) {
  return tx.$queryRaw<
    Apontamento[]
  >`SELECT a.*, e.id AS substituido FROM ordem_producao_apontamento a LEFT JOIN producao_apontamento_evento e ON e.id_apontamento_anterior=a.id WHERE a.id_ordem_producao=${id} ORDER BY a.id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`
}
export async function totais(tx: Transaction, id: number, item: number) {
  return tx.$queryRaw<
    Total[]
  >`SELECT a.id_setor, SUM(a.quantidade_produzida) AS produzida, SUM(a.quantidade_perdida) AS perdida FROM ordem_producao_apontamento a WHERE a.id_ordem_producao=${id} AND a.id_ordem_producao_item=${item} AND NOT EXISTS(SELECT 1 FROM producao_apontamento_evento e WHERE e.id_apontamento_anterior=a.id) GROUP BY a.id_setor`
}
export async function inserirEvento(
  tx: Transaction,
  data: Omit<Evento, "id" | "data_cadastro">,
) {
  await tx.$executeRaw`INSERT INTO producao_apontamento_evento(id_empresa,id_ordem_producao,id_etapa,id_ordem_producao_item,id_setor,id_usuario,chave_idempotencia,hash_requisicao,tipo,id_apontamento_novo,id_apontamento_anterior,motivo) VALUES(${data.id_empresa},${data.id_ordem_producao},${data.id_etapa},${data.id_ordem_producao_item},${data.id_setor},${data.id_usuario},${data.chave_idempotencia},${data.hash_requisicao},${data.tipo},${data.id_apontamento_novo},${data.id_apontamento_anterior},${data.motivo})`
  return (await eventoPorChave(tx, data.id_empresa, data.chave_idempotencia))!
}

export async function totaisDaOrdem(tx: Transaction, id: number) {
  return tx.$queryRaw<Array<Total & { id_ordem_producao_item: number }>>`
    SELECT a.id_ordem_producao_item,a.id_setor,
      SUM(a.quantidade_produzida) AS produzida,SUM(a.quantidade_perdida) AS perdida
    FROM ordem_producao_apontamento a
    WHERE a.id_ordem_producao=${id}
      AND NOT EXISTS(SELECT 1 FROM producao_apontamento_evento e WHERE e.id_apontamento_anterior=a.id)
    GROUP BY a.id_ordem_producao_item,a.id_setor
  `
}
