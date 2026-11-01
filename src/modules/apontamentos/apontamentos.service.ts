import "server-only"
import { createHash } from "node:crypto"
import { Prisma } from "@/generated/prisma/client"
import { serializarJsonTextMysql } from "@/lib/limites-texto"
import {
  ProducaoError,
  type Contexto,
  type Transaction,
} from "@/modules/producao/producao.repository"
import * as repository from "./apontamentos.repository"
import {
  validarData,
  validarDisponibilidade,
  validarEstornoLegado,
  type Total,
} from "./apontamentos.regras"
import {
  dataPersistida,
  type RegistroInput,
  type CorrecaoInput,
  type EstornoInput,
} from "./apontamentos.schema"

function serializar(apontamento: Omit<repository.Apontamento, "substituido">) {
  return {
    ...apontamento,
    quantidade_produzida: apontamento.quantidade_produzida.toFixed(3),
    quantidade_perdida: apontamento.quantidade_perdida.toFixed(3),
    data_apontamento: apontamento.data_apontamento.toISOString().slice(0, 10),
  }
}
async function resultado(tx: Transaction, evento: repository.Evento) {
  const novo = evento.id_apontamento_novo
    ? await tx.ordem_producao_apontamento.findUniqueOrThrow({
        where: { id: evento.id_apontamento_novo },
      })
    : null
  return { evento, apontamento: novo ? serializar(novo) : null }
}
type Operacao =
  | { tipo: "REGISTRO"; dados: RegistroInput }
  | { tipo: "CORRECAO"; dados: CorrecaoInput; alvo: number }
  | { tipo: "ESTORNO"; dados: EstornoInput; alvo: number }

export function gravar(
  ctx: Contexto,
  ordemId: number,
  chave: string,
  operacao: Operacao,
) {
  const hash = createHash("sha256")
    .update(JSON.stringify({ ordemId, ...operacao }))
    .digest("hex")
  return repository.escrita(ctx, ordemId, async (tx, ordem) => {
    // Revalidar autorização dentro da transação precede inclusive um replay.
    const existente = await repository.eventoPorChave(tx, ctx.idEmpresa, chave)
    if (existente) {
      if (
        existente.id_usuario !== ctx.idUsuario ||
        existente.hash_requisicao !== hash
      )
        throw new ProducaoError(
          409,
          "Chave de idempotência já utilizada com outro conteúdo ou autor.",
        )
      return { ...(await resultado(tx, existente)), repetido: true }
    }
    if (!["EM_PRODUCAO", "PAUSADA", "CONCLUIDA"].includes(ordem.status))
      throw new ProducaoError(
        409,
        "A ordem deve ter iniciado a produção e não pode estar cancelada.",
      )
    const anterior =
      operacao.tipo !== "REGISTRO"
        ? await tx.ordem_producao_apontamento.findFirst({
            where: { id: operacao.alvo, id_ordem_producao: ordemId },
          })
        : null
    if (operacao.tipo !== "REGISTRO" && !anterior)
      throw new ProducaoError(404, "Apontamento não encontrado nesta ordem.")
    if (anterior) {
      const alterado = await tx.$queryRaw<
        Array<{ id: number }>
      >`SELECT id FROM producao_apontamento_evento WHERE id_apontamento_anterior=${anterior.id}`
      if (alterado.length)
        throw new ProducaoError(
          409,
          "Apontamento já corrigido ou estornado. Utilize o registro substituto válido.",
        )
    }
    const etapas = await repository.etapas(tx, ordemId)
    const etapa =
      operacao.tipo === "REGISTRO"
        ? etapas.find((e) => e.id === operacao.dados.idEtapa)
        : etapas.find((e) => e.id_setor === anterior!.id_setor)
    if (!etapa)
      throw new ProducaoError(404, "Etapa não encontrada nesta ordem.")
    if (!["EM_PRODUCAO", "CONCLUIDA"].includes(etapa.status))
      throw new ProducaoError(
        409,
        "A etapa deve ter sido iniciada para receber apontamentos.",
      )
    const itemId =
      operacao.tipo === "REGISTRO"
        ? operacao.dados.idItem
        : anterior!.id_ordem_producao_item
    const item = await tx.ordem_producao_item.findFirst({
      where: { id: itemId, id_ordem_producao: ordemId },
    })
    if (!item) throw new ProducaoError(404, "Item não encontrado nesta ordem.")
    // Mesma ordem de locks do cadastro de produtos: empresa, produto.
    // Evita que a unidade mude enquanto o primeiro apontamento é gravado.
    await tx.$queryRaw`SELECT id FROM produtos WHERE id=${item.id_produto} FOR UPDATE`
    const novos = operacao.tipo === "ESTORNO" ? null : operacao.dados
    if (novos) validarData(novos.dataApontamento, etapa.data_inicio, new Date())
    const totais = await repository.totais(tx, ordemId, itemId)
    const atual = totais.find((t) => t.id_setor === etapa.id_setor) ?? {
      id_setor: etapa.id_setor,
      produzida: new Prisma.Decimal(0),
      perdida: new Prisma.Decimal(0),
    }
    const revisado: Total = {
      id_setor: etapa.id_setor,
      produzida: new Prisma.Decimal(atual.produzida)
        .minus(anterior?.quantidade_produzida ?? 0)
        .plus(novos?.quantidadeProduzida ?? 0),
      perdida: new Prisma.Decimal(atual.perdida)
        .minus(anterior?.quantidade_perdida ?? 0)
        .plus(novos?.quantidadePerdida ?? 0),
    }
    const posteriores = [
      ...totais.filter((t) => t.id_setor !== etapa.id_setor),
      revisado,
    ]
    try {
      validarDisponibilidade(etapas, item.quantidade, posteriores)
    } catch (error) {
      if (!(error instanceof ProducaoError) || operacao.tipo !== "ESTORNO")
        throw error
      validarEstornoLegado(etapas, item.quantidade, totais, posteriores)
    }
    const novo = novos
      ? await tx.ordem_producao_apontamento.create({
          data: {
            id_ordem_producao: ordemId,
            id_ordem_producao_item: itemId,
            id_setor: etapa.id_setor,
            id_usuario: ctx.idUsuario,
            quantidade_produzida: novos.quantidadeProduzida,
            quantidade_perdida: novos.quantidadePerdida,
            motivo_perda: novos.motivoPerda,
            data_apontamento: dataPersistida(novos.dataApontamento),
          },
        })
      : null
    const motivo =
      operacao.tipo === "REGISTRO"
        ? null
        : operacao.tipo === "CORRECAO"
          ? operacao.dados.motivoCorrecao
          : operacao.dados.motivo
    const evento = await repository.inserirEvento(tx, {
      id_empresa: ctx.idEmpresa,
      id_ordem_producao: ordemId,
      id_etapa: etapa.id,
      id_ordem_producao_item: itemId,
      id_setor: etapa.id_setor,
      id_usuario: ctx.idUsuario,
      chave_idempotencia: chave,
      hash_requisicao: hash,
      tipo: operacao.tipo,
      id_apontamento_novo: novo?.id ?? null,
      id_apontamento_anterior: anterior?.id ?? null,
      motivo,
    })
    await tx.auditoria.create({
      data: {
        id_empresa: ctx.idEmpresa,
        id_usuario: ctx.idUsuario,
        tabela: "producao_apontamento_evento",
        id_registro: evento.id,
        acao: "INSERT",
        dados_anteriores: anterior
          ? serializarJsonTextMysql(
              serializar(anterior),
              (msg) => new ProducaoError(400, msg),
            )
          : null,
        dados_novos: serializarJsonTextMysql(
          { evento, apontamento: novo ? serializar(novo) : null },
          (msg) => new ProducaoError(400, msg),
        ),
      },
    })
    return {
      evento,
      apontamento: novo ? serializar(novo) : null,
      repetido: false,
    }
  })
}

export function consultar(
  ctx: Contexto,
  ordemId: number,
  page: number,
  limit: number,
) {
  return repository.leitura(async (tx) => {
    const ordem = await tx.ordem_producao.findFirst({
      where: { id: ordemId, id_empresa: ctx.idEmpresa },
    })
    if (!ordem) throw new ProducaoError(404, "Ordem não encontrada.")
    const etapas = await repository.etapas(tx, ordemId)
    const itens = await tx.ordem_producao_item.findMany({
      where: { id_ordem_producao: ordemId },
      include: { produtos: { select: { unidade: true } } },
      orderBy: { id: "asc" },
    })
    const totais = []
    for (const item of itens) {
      const acumulados = await repository.totais(tx, ordemId, item.id)
      // Legados inconsistentes continuam visíveis sem inventar disponibilidade.
      let disponibilidade = null,
        pendencia = null
      try {
        disponibilidade = validarDisponibilidade(
          etapas,
          item.quantidade,
          acumulados,
        )
      } catch (error) {
        if (!(error instanceof ProducaoError)) throw error
        pendencia = error.message
      }
      totais.push({
        idItem: item.id,
        idProduto: item.id_produto,
        idCor: item.id_cor,
        idTamanho: item.id_tamanho,
        unidade: item.produtos.unidade,
        planejada: item.quantidade.toFixed(3),
        etapas: acumulados.map((t) => ({
          idEtapa: etapas.find((e) => e.id_setor === t.id_setor)?.id,
          idSetor: t.id_setor,
          produzida: t.produzida.toFixed(3),
          perdida: t.perdida.toFixed(3),
        })),
        disponibilidade,
        pendencia,
      })
    }
    const rows = await repository.apontamentos(tx, ordemId, page, limit)
    const count = await tx.ordem_producao_apontamento.count({
      where: { id_ordem_producao: ordemId },
    })
    const countEventos = await tx.producao_apontamento_evento.count({
      where: { id_empresa: ctx.idEmpresa, id_ordem_producao: ordemId },
    })
    const eventos = await tx.$queryRaw<
      repository.Evento[]
    >`SELECT * FROM producao_apontamento_evento WHERE id_empresa=${ctx.idEmpresa} AND id_ordem_producao=${ordemId} ORDER BY id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`
    return {
      idOrdem: ordemId,
      rows: rows.map((row) => ({
        ...serializar(row),
        valido: row.substituido === null,
        idEventoSubstituicao: row.substituido,
      })),
      count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
      eventos,
      eventosPaginacao: {
        count: countEventos,
        page,
        limit,
        totalPages: Math.ceil(countEventos / limit),
      },
      totais,
    }
  })
}
