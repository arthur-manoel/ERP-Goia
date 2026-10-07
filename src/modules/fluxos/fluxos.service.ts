import "server-only"
import * as repo from "./fluxos.repository"
import {
  ProducaoError,
  transacao,
  type Contexto,
} from "../producao/producao.repository"
import type { Cadastro, Edicao, Listagem } from "./fluxos.schema"
import type { Transaction } from "../producao/producao.repository"

function apresentar(row: repo.Registro) {
  const { status, ...dados } = row
  return { ...dados, ativo: status === "ATIVO" }
}
async function detalhe(
  tx: Transaction,
  ctx: Contexto,
  tipo: repo.Entidade,
  row: repo.Registro,
) {
  const dados = apresentar(row)
  if (tipo === "setor") return dados
  return {
    ...dados,
    setores: (await repo.setoresFluxo(tx, ctx, row.id)).map((s) => ({
      ...apresentar(s),
      ordem: s.ordem,
    })),
  }
}
export function validarFluxo(fluxo: repo.Fluxo) {
  if (
    fluxo.status !== "ATIVO" ||
    !fluxo.setores.length ||
    fluxo.setores.some((s) => s.status !== "ATIVO")
  )
    throw new ProducaoError(
      422,
      "O fluxo deve estar ativo e conter setores ativos.",
    )
}
export function consultar(ctx: Contexto, tipo: repo.Entidade, id: number) {
  return transacao(async (tx) => ({
    [tipo]: await detalhe(tx, ctx, tipo, await repo.buscar(tx, ctx, tipo, id)),
  }))
}
export function listar(ctx: Contexto, tipo: repo.Entidade, input: Listagem) {
  return transacao(async (tx) => {
    const { rows, total } = await repo.listar(tx, ctx, tipo, input)
    const registros = []
    for (const row of rows) registros.push(await detalhe(tx, ctx, tipo, row))
    return {
      [tipo === "setor" ? "setores" : "fluxos"]: registros,
      paginacao: {
        pagina: input.pagina,
        limite: input.limite,
        total,
        totalPaginas: Math.ceil(total / input.limite),
      },
    }
  })
}
export function salvar(
  ctx: Contexto,
  tipo: repo.Entidade,
  input: Edicao,
  id?: number,
) {
  return transacao(async (tx) => {
    const antes =
      id === undefined ? undefined : await repo.buscar(tx, ctx, tipo, id)
    const antesDetalhe = antes ? await detalhe(tx, ctx, tipo, antes) : null
    if (tipo === "fluxo" && input.setores) {
      for (const setorId of [...input.setores].sort((a, b) => a - b)) {
        const setor = await repo.buscar(tx, ctx, "setor", setorId)
        if (setor.status !== "ATIVO")
          throw new ProducaoError(422, "Selecione apenas setores ativos.")
      }
    }
    const dados: Cadastro = {
      nome: input.nome ?? antes?.nome ?? "",
      descricao:
        input.descricao === undefined ? antes?.descricao : input.descricao,
      ativo: input.ativo ?? (antes ? antes.status === "ATIVO" : true),
    }
    const salvo = await repo.gravar(tx, ctx, tipo, dados, id)
    if (tipo === "fluxo" && input.setores)
      await repo.substituirSetores(tx, salvo, input.setores)
    const depois = await detalhe(
      tx,
      ctx,
      tipo,
      await repo.buscar(tx, ctx, tipo, salvo),
    )
    await repo.auditarCadastro(
      tx,
      ctx,
      tipo === "setor" ? "setores" : "fluxos_producao",
      salvo,
      antesDetalhe,
      depois,
    )
    return { [tipo]: depois }
  })
}
export function excluir(ctx: Contexto, tipo: repo.Entidade, id: number) {
  return transacao(async (tx) => {
    const antes = await detalhe(
      tx,
      ctx,
      tipo,
      await repo.buscar(tx, ctx, tipo, id),
    )
    if (await repo.emUso(tx, tipo, id))
      throw new ProducaoError(
        409,
        tipo === "setor"
          ? "O setor está vinculado a um fluxo. Inative-o ou remova o vínculo."
          : "O fluxo está em uso por ordens em andamento.",
      )
    // A exclusão do fluxo remove associações por cascade; registrar cada remoção.
    if (tipo === "fluxo") {
      for (const produto of await repo.produtosDoFluxo(tx, ctx, id)) {
        await repo.auditarCadastro(
          tx,
          ctx,
          "produto_fluxo",
          produto.id_produto_empresa,
          {
            idEmpresa: ctx.idEmpresa,
            idProduto: produto.id_produto,
            fluxoId: id,
          },
          null,
        )
      }
    }
    await repo.remover(tx, ctx, tipo, id)
    await repo.auditarCadastro(
      tx,
      ctx,
      tipo === "setor" ? "setores" : "fluxos_producao",
      id,
      antes,
      null,
    )
  })
}
export function associar(ctx: Contexto, id: number, fluxoId: number | null) {
  return transacao(async (tx) => {
    const produto = await repo.produto(tx, ctx, id)
    const anterior = await repo.associacao(tx, ctx, id)
    if (fluxoId !== null) {
      const fluxo = {
        ...(await repo.buscar(tx, ctx, "fluxo", fluxoId)),
        setores: await repo.setoresFluxo(tx, ctx, fluxoId),
      }
      validarFluxo(fluxo)
    }
    if (anterior !== fluxoId) {
      await repo.associar(tx, ctx, id, fluxoId)
      await repo.auditarCadastro(
        tx,
        ctx,
        "produto_fluxo",
        produto.id,
        anterior === null
          ? null
          : { idEmpresa: ctx.idEmpresa, idProduto: id, fluxoId: anterior },
        fluxoId === null
          ? null
          : { idEmpresa: ctx.idEmpresa, idProduto: id, fluxoId },
      )
    }
    return { produto: { id, fluxoId } }
  })
}

export function consultarAssociacao(ctx: Contexto, id: number) {
  return transacao(async (tx) => {
    await repo.produto(tx, ctx, id)
    const fluxoId = await repo.associacao(tx, ctx, id)
    const fluxo =
      fluxoId === null
        ? null
        : await detalhe(
            tx,
            ctx,
            "fluxo",
            await repo.buscar(tx, ctx, "fluxo", fluxoId),
          )
    return { produto: { id, fluxoId }, fluxo }
  })
}
