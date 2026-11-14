import "server-only"
import * as repo from "./fluxos.repository"
import {
  ProducaoError,
  transacao,
  type Contexto,
} from "../producao/producao.repository"
import { perfisDosRecursos } from "../auth/auth.role"
import { ehInativacao } from "./fluxos.regras"
import { TIPO_SETOR_PADRAO } from "./fluxos.schema"
import type { Cadastro, Edicao, Listagem } from "./fluxos.schema"
import type { Transaction } from "../producao/producao.repository"
import {
  perfisAntesDeAlterarSetor,
  revogarPerfisAlterados,
} from "../auth/auth.perfis"

const semPermissoes = {
  ler: false,
  criar: false,
  editar: false,
  excluir: false,
}
function apresentar(row: repo.Registro) {
  const { status, ...dados } = row
  return { ...dados, ativo: status === "ATIVO" }
}
function exigirAdministrador(ctx: Contexto) {
  if (ctx.administrador !== true)
    throw new ProducaoError(
      403,
      "Somente administradores da empresa podem alterar tipos e permissões de setor.",
    )
}
async function detalhe(
  tx: Transaction,
  ctx: Contexto,
  tipo: repo.Entidade,
  row: repo.Registro,
  recursos?: string[],
) {
  const dados = apresentar(row)
  if (tipo === "setor")
    return {
      ...dados,
      recursos:
        recursos ??
        (await repo.recursosDosSetores(tx, [row.id])).get(row.id) ??
        [],
    }
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
    const recursos =
      tipo === "setor"
        ? await repo.recursosDosSetores(
            tx,
            rows.map((row) => row.id),
          )
        : undefined
    for (const row of rows)
      registros.push(
        await detalhe(tx, ctx, tipo, row, recursos?.get(row.id) ?? []),
      )
    return {
      [tipo === "setor" ? "setores" : "fluxos"]: registros,
      permissoes: ctx.pode ?? semPermissoes,
      administrador: ctx.administrador === true,
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
  // A edição bloqueia a linha do setor e os usuários afetados. Após esperar
  // pelo usuário, precisa ler e revogar o refresh confirmado pela rotação.
  const isolamento =
    tipo === "setor" && id !== undefined ? "ReadCommitted" : undefined
  return transacao(async (tx) => {
    const antes =
      id === undefined ? undefined : await repo.buscar(tx, ctx, tipo, id)
    // Inativar exige "excluir" somente na transição ATIVO → INATIVO. Reenviar
    // ativo:false em quem já está inativo não é inativação (editar basta).
    const inativando = ehInativacao(antes?.status, input.ativo)
    if (inativando && ctx.pode?.excluir !== true)
      throw new ProducaoError(403, "Você não tem permissão para inativar.")
    if (tipo === "setor" && inativando && id !== undefined) {
      const fluxos = await repo.fluxosAtivosDoSetor(tx, ctx, id)
      if (fluxos.length)
        throw new ProducaoError(
          409,
          `Este setor está em uso no${fluxos.length > 1 ? "s fluxos" : " fluxo"} ${fluxos
            .map((fluxo) => `"${fluxo.nome}"`)
            .join(
              ", ",
            )} e não pode ser inativado. Remova-o antes de continuar.`,
        )
    }
    // O tipo só é validado quando muda: valores antigos (texto livre ou tipo
    // depois inativado) não impedem editar os demais campos.
    let tipoSetor = antes?.tipo ?? TIPO_SETOR_PADRAO
    if (
      tipo === "setor" &&
      input.tipo !== undefined &&
      input.tipo !== antes?.tipo
    ) {
      if (input.tipo.toLowerCase() === TIPO_SETOR_PADRAO.toLowerCase())
        tipoSetor = TIPO_SETOR_PADRAO
      else {
        const encontrado = await repo.tipoAtivoPorNome(tx, ctx, input.tipo)
        if (!encontrado)
          throw new ProducaoError(422, "Selecione um tipo de setor ativo.")
        tipoSetor = encontrado.nome
      }
    }
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
      tipo: tipoSetor,
    }
    const perfis =
      tipo === "setor" &&
      antes &&
      (antes.nome !== dados.nome || (antes.status === "ATIVO") !== dados.ativo)
        ? await perfisAntesDeAlterarSetor(tx, antes.id, ctx.idUsuario)
        : null
    const salvo = await repo.gravar(tx, ctx, tipo, dados, id)
    if (perfis) await revogarPerfisAlterados(tx, ctx, perfis)
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
  }, isolamento)
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

export function substituirRecursosSetor(
  ctx: Contexto,
  id: number,
  recursos: string[],
) {
  return transacao(async (tx) => {
    // Perfis de login nascem destes recursos: só administradores os alteram,
    // nunca quem apenas edita setores (que pode renomeá-los).
    exigirAdministrador(ctx)
    const setor = await repo.buscar(tx, ctx, "setor", id)
    if (perfisDosRecursos(recursos).size > 1)
      throw new ProducaoError(
        422,
        "Os recursos selecionados definem mais de um perfil de acesso. Use recursos de um único perfil.",
      )
    const antes = await detalhe(tx, ctx, "setor", setor)
    await repo.substituirRecursos(tx, id, recursos)
    const depois = await detalhe(tx, ctx, "setor", setor)
    await repo.auditarCadastro(tx, ctx, "permissoes_setor", id, antes, depois)
    return { setor: depois }
  })
}
const apresentarTipo = (t: { id: number; nome: string; status: string }) => ({
  id: t.id,
  nome: t.nome,
  ativo: t.status === "ATIVO",
})
export function listarTipos(ctx: Contexto, status?: "ATIVO" | "INATIVO") {
  return transacao(async (tx) => ({
    tipos: (await repo.tiposDaEmpresa(tx, ctx, status)).map(apresentarTipo),
    permissoes: ctx.pode ?? semPermissoes,
    administrador: ctx.administrador === true,
  }))
}
export function criarTipo(ctx: Contexto, nome: string) {
  return transacao(async (tx) => {
    exigirAdministrador(ctx)
    const tipo = await repo.criarTipo(tx, ctx, nome)
    await repo.auditarCadastro(
      tx,
      ctx,
      "tipos_setor",
      tipo.id,
      null,
      apresentarTipo(tipo),
    )
    return { tipo: apresentarTipo(tipo) }
  })
}
export function alterarStatusTipo(ctx: Contexto, id: number, ativo: boolean) {
  return transacao(async (tx) => {
    exigirAdministrador(ctx)
    const antes = await repo.buscarTipo(tx, ctx, id)
    const depois = await repo.alterarStatusTipo(
      tx,
      id,
      ativo ? "ATIVO" : "INATIVO",
    )
    await repo.auditarCadastro(
      tx,
      ctx,
      "tipos_setor",
      id,
      apresentarTipo(antes),
      apresentarTipo(depois),
    )
    return { tipo: apresentarTipo(depois) }
  })
}
