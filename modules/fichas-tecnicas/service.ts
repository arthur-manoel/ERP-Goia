import "server-only"
import { Prisma } from "../../src/generated/prisma/client"
import {
  ConflictError,
  HttpError,
  NotFoundError,
  ValidationError,
} from "../../src/lib/api/errors"
import { validate } from "../../src/lib/api/http"
import { disputaPersistencia } from "../../src/lib/prisma-concorrencia"
import { allowedCompanies, type Action } from "../catalogos/repository"
import { withCompanyWriteLock } from "../catalogos/transactions"
import * as repo from "./repository"
import { produtoQuerySchema, salvarFichaSchema } from "./schema"

export type Contexto = { idUsuario: number; idEmpresa: number }

function resposta(row: repo.FichaComItens | null) {
  if (!row) return null
  return {
    id: row.id,
    versao: row.versao,
    itens: row.ficha_tecnica_item.map((item) => ({
      id_produto_componente: item.id_produto_componente,
      quantidade: item.quantidade.toFixed(3),
    })),
  }
}

async function exigePermissao(
  ctx: Contexto,
  tx: repo.Database,
  action: Action,
) {
  const companies = await allowedCompanies(
    ctx.idUsuario,
    "PRODUTOS",
    action,
    tx,
  )
  if (!companies.includes(ctx.idEmpresa))
    throw new HttpError(
      403,
      "Sem permissão para esta operação na empresa ativa.",
    )
}

export async function buscarAtiva(ctx: Contexto, input: unknown) {
  const { id_produto } = validate(produtoQuerySchema, input)
  return repo.leitura(async (tx) => {
    await exigePermissao(ctx, tx, "pode_ler")
    const acessivel = await repo.produtoAcessivel(tx, ctx.idEmpresa, id_produto)
    if (!acessivel) throw new NotFoundError("Produto não encontrado.")
    await exigirFabricavel(ctx, tx, id_produto)
    return resposta(await repo.fichaAtiva(ctx.idEmpresa, id_produto, tx))
  })
}

export async function salvarAtiva(
  ctx: Contexto,
  input: unknown,
): Promise<ReturnType<typeof resposta>> {
  const data = validate(salvarFichaSchema, input)
  try {
    return await withCompanyWriteLock([ctx.idEmpresa], async (tx) => {
      await exigePermissao(ctx, tx, "pode_editar")
      if (!(await repo.produtoAcessivel(tx, ctx.idEmpresa, data.id_produto)))
        throw new NotFoundError("Produto não encontrado.")
      await repo.bloquearProdutos(tx, ctx.idEmpresa, [
        data.id_produto,
        ...data.itens.map((item) => item.id_produto_componente),
      ])
      await exigirFabricavel(ctx, tx, data.id_produto)
      const ids = data.itens.map((item) => item.id_produto_componente)
      const elegiveis = await repo.contarComponentesElegiveis(
        tx,
        ctx.idEmpresa,
        ids,
      )
      if (elegiveis !== ids.length)
        throw new ValidationError(
          "Todos os componentes devem estar ativos, controlar estoque e pertencer à empresa.",
        )

      const atual = await repo.fichaAtiva(ctx.idEmpresa, data.id_produto, tx)
      if ((atual?.id ?? null) !== data.id_ficha_esperada)
        throw new ConflictError(
          "A ficha ativa mudou. Recarregue antes de salvar novamente.",
        )
      if (atual && mesmaComposicao(atual, data.itens)) return resposta(atual)

      const maximo = (
        await repo.versaoMaisAlta(tx, ctx.idEmpresa, data.id_produto)
      )._max.versao
      if (maximo !== null && maximo >= 2_147_483_647)
        throw new ConflictError("Limite de versões da ficha técnica atingido.")

      await repo.inativarAtivas(tx, ctx.idEmpresa, data.id_produto)
      const nova = await repo.criarVersao(
        tx,
        ctx.idEmpresa,
        data,
        (maximo ?? 0) + 1,
        new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z"),
      )
      await repo.auditar(tx, ctx, atual, nova)
      return resposta(nova)
    })
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (disputaPersistencia(error))
      throw new ConflictError(
        "Conflito ao salvar a ficha técnica. Recarregue e tente novamente.",
      )
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2003")
        throw new ValidationError("Produto ou componente não encontrado.")
    }
    throw error
  }
}

function mesmaComposicao(
  ficha: repo.FichaComItens,
  itens: Array<{ id_produto_componente: number; quantidade: string }>,
) {
  if (ficha.ficha_tecnica_item.some((item) => !item.perda_percentual.isZero()))
    return false
  const anterior = ficha.ficha_tecnica_item
    .map(
      (item) =>
        [item.id_produto_componente, item.quantidade.toFixed(3)] as const,
    )
    .sort(([a], [b]) => a - b)
  const nova = itens
    .map(
      (item) =>
        [
          item.id_produto_componente,
          new Prisma.Decimal(item.quantidade).toFixed(3),
        ] as const,
    )
    .sort(([a], [b]) => a - b)
  return (
    anterior.length === nova.length &&
    anterior.every(
      ([id, quantidade], index) =>
        id === nova[index][0] && quantidade === nova[index][1],
    )
  )
}

async function exigirFabricavel(
  ctx: Contexto,
  tx: repo.Database,
  idProduto: number,
) {
  if (!(await repo.produtoFabricavelAtivo(tx, ctx.idEmpresa, idProduto)))
    throw new ValidationError(
      "O produto deve estar ativo, vinculado à empresa e habilitado para produção.",
    )
}
