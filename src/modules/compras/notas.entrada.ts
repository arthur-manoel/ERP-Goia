import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { variacaoAtivaNaEmpresa } from "@/modules/estoque/estoque.grade"
import { conferir, executarNaTransacao } from "@/modules/reservas/operacoes"
import {
  ComprasError,
  auditar,
  exigirFornecedor,
  exigirLocal,
  exigirSetor,
  insumoDaEmpresa,
  type Contexto,
  type Transaction,
} from "./compras.repository"
import {
  carregarFisico,
  receberFisico,
  variacaoDoItem,
  comprovarMovimento,
  vincularMovimento,
} from "./compras.recebimento"
import type {
  LinhaNota,
  ConferenciaNota,
  ProcessamentoNota,
} from "./notas.schema"
const fail = (s: string): never => {
  throw new ComprasError(409, s)
}
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue
export function calcularValorLinha(
  q: string,
  unitario: string,
  tipo: "UNITARIO" | "METRO" | "TOTAL",
) {
  const total =
    tipo === "TOTAL"
      ? new Prisma.Decimal(unitario)
      : new Prisma.Decimal(q)
          .mul(unitario)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
  if (!total.isFinite() || total.lt(0) || total.gt("9999999999999.99"))
    throw new ComprasError(
      400,
      "Valor da linha excede a precisão monetária do banco.",
    )
  return total
}
async function nota(tx: Transaction, ctx: Contexto, id: number) {
  const n = await tx.nota_fiscal.findFirst({
    where: { id, id_empresa: ctx.idEmpresa },
    include: {
      item_nota_fiscal: {
        orderBy: { numero_item: "asc" },
        include: {
          setores: { select: { nome: true, id_empresa: true } },
          locais_estoque: { select: { nome: true, id_empresa: true } },
        },
      },
    },
  })
  if (!n) throw new ComprasError(404, "Nota fiscal não encontrada.")
  return n
}
export async function gravarItensNota(
  tx: Transaction,
  ctx: Contexto,
  id: number,
  itens: LinhaNota[],
  versao?: number,
  justificativa?: string | null,
) {
  await conferir(tx, ctx, [
    ["NOTAS_FISCAIS", versao === undefined ? "criar" : "editar"],
  ])
  const n = await nota(tx, ctx, id)
  if (
    !["PENDENTE", "RECEBIDA"].includes(n.status) ||
    n.entrada_processada ||
    (await tx.nota_item_entrada.count({ where: { id_nota: id } }))
  )
    fail(
      "Somente notas pendentes sem efeitos de estoque podem alterar seus itens.",
    )
  if (versao !== undefined && n.versao !== versao)
    fail("A nota foi alterada. Recarregue antes de conferir os itens.")
  await exigirFornecedor(tx, ctx, n.id_fornecedor)
  const fisico = n.id_compra ? await carregarFisico(tx, ctx, n.id_compra) : null
  if (
    fisico &&
    (fisico.compra.status === "CANCELADA" ||
      fisico.compra.id_fornecedor !== n.id_fornecedor ||
      fisico.compra.id_pedido_compra_legado !== n.id_pedido_compra)
  )
    fail("Compra, pedido e fornecedor não correspondem à nota ativa.")
  const preparadas: {
    antigo: (typeof n.item_nota_fiscal)[number] | undefined
    data: Omit<
      Prisma.item_nota_fiscalGetPayload<object>,
      | "id"
      | "id_nota_fiscal"
      | "produto_cadastrado_automaticamente"
      | "quantidade"
      | "valor_unitario"
      | "valor_total"
    > & { quantidade: string; valor_unitario: string; valor_total: string }
  }[] = []
  const idsExplicitos = new Set(itens.flatMap((i) => (i.id ? [i.id] : [])))
  const idsResolvidos = new Set<number>()
  for (const input of itens) {
    const antigo = input.id
      ? n.item_nota_fiscal.find((i) => i.id === input.id)
      : n.item_nota_fiscal.find(
          (i) =>
            i.numero_item === input.numeroItem &&
            !idsExplicitos.has(i.id) &&
            !idsResolvidos.has(i.id),
        )
    if (input.id && !antigo)
      throw new ComprasError(400, "Linha fiscal não pertence a esta nota.")
    if (antigo) {
      if (idsResolvidos.has(antigo.id))
        throw new ComprasError(400, "Linha fiscal repetida na conferência.")
      idsResolvidos.add(antigo.id)
    }
    const calculado = calcularValorLinha(
      input.quantidade,
      input.valorUnitario,
      input.tipoValor,
    )
    if (!calculado.eq(input.valorTotal))
      throw new ComprasError(
        400,
        "Valor total da linha não corresponde à quantidade, ao tipo de valor e ao valor informado.",
      )
    const item = input.idCompraItem
      ? fisico?.compra.compra_itens.find((i) => i.id === input.idCompraItem)
      : null
    if (input.idCompraItem && !item)
      throw new ComprasError(
        400,
        "Item não pertence à compra vinculada à nota.",
      )
    const produto = input.idProduto
      ? await tx.produtos.findFirst({
          where: {
            id: input.idProduto,
            ...insumoDaEmpresa(ctx.idEmpresa),
            controla_estoque: true,
          },
        })
      : null
    if (input.idProduto && !produto)
      throw new ComprasError(
        400,
        "Produto ativo e comprável não encontrado na empresa.",
      )
    if (item && produto && item.id_produto !== produto.id)
      throw new ComprasError(400, "Produto não corresponde ao item da compra.")
    if (produto && input.unidade !== produto.unidade.trim().toUpperCase())
      throw new ComprasError(
        400,
        "Unidade fiscal incompatível com a unidade de estoque. Conversão não cadastrada.",
      )
    if (input.tipoValor === "METRO" && input.unidade !== "M")
      throw new ComprasError(400, "O tipo METRO exige unidade M.")
    let variacao = null
    if (input.idVariacao && !produto)
      throw new ComprasError(400, "Selecione o produto antes da variação.")
    if (produto && item && (input.idVariacao || item.id_cor || item.id_tamanho))
      variacao = await variacaoDoItem(tx, ctx, item, input.idVariacao)
    else if (input.idVariacao) {
      variacao = await tx.produto_variacoes.findFirst({
        where: {
          id: input.idVariacao,
          id_empresa: ctx.idEmpresa,
          id_produto: produto!.id,
          status: "ATIVO",
        },
      })
      if (!variacao)
        throw new ComprasError(
          400,
          "Variação inválida para o produto e a empresa.",
        )
    }
    if (input.idLocalEstoque) {
      await exigirLocal(tx, ctx, input.idLocalEstoque)
      if (fisico && input.idLocalEstoque !== fisico.compra.id_local_estoque)
        throw new ComprasError(
          400,
          "O local deve corresponder ao destino da compra.",
        )
    }
    if (input.idSetor) await exigirSetor(tx, ctx, input.idSetor)
    preparadas.push({
      antigo,
      data: {
        id_empresa: ctx.idEmpresa,
        id_compra: n.id_compra,
        id_compra_item: input.idCompraItem ?? null,
        numero_item: input.numeroItem,
        id_produto: input.idProduto ?? null,
        id_variacao: variacao?.id ?? null,
        id_cor: variacao?.id_cor ?? null,
        id_tamanho: variacao?.id_tamanho ?? null,
        id_local_estoque: input.idLocalEstoque ?? null,
        id_setor: input.idSetor ?? null,
        codigo_produto: input.codigo ?? null,
        descricao_produto: input.descricao ?? null,
        quantidade: input.quantidade,
        unidade: input.unidade,
        tipo_valor: input.tipoValor,
        valor_unitario: input.valorUnitario,
        valor_total: input.valorTotal,
      },
    })
  }
  const soma = preparadas.reduce(
    (s, i) => s.plus(i.data.valor_total),
    new Prisma.Decimal(0),
  )
  if (soma.gt("9999999999999.99"))
    throw new ComprasError(
      400,
      "Somatório dos itens excede a precisão do documento.",
    )
  // A renumeração temporária só existe nesta transação e preserva IDs das linhas editadas.
  await tx.$executeRaw`UPDATE item_nota_fiscal SET numero_item=-numero_item WHERE id_nota_fiscal=${id}`
  const mantidas: number[] = []
  for (const l of preparadas) {
    const row = l.antigo
      ? await tx.item_nota_fiscal.update({
          where: { id: l.antigo.id },
          data: l.data,
        })
      : await tx.item_nota_fiscal.create({
          data: {
            ...l.data,
            id_nota_fiscal: id,
            produto_cadastrado_automaticamente: false,
          },
        })
    mantidas.push(row.id)
    await auditar(tx, ctx, "item_nota_fiscal", row.id, l.antigo ?? null, {
      id: row.id,
      ...l.data,
    })
  }
  for (const removida of n.item_nota_fiscal.filter(
    (i) => !mantidas.includes(i.id),
  ))
    await auditar(tx, ctx, "item_nota_fiscal", removida.id, removida, {
      idNota: id,
      removido: true,
    })
  await tx.item_nota_fiscal.deleteMany({
    where: { id_nota_fiscal: id, id: { notIn: mantidas } },
  })
  const r = await tx.nota_fiscal.updateMany({
    where: {
      id,
      id_empresa: ctx.idEmpresa,
      versao: n.versao,
      entrada_processada: false,
      status: { in: ["PENDENTE", "RECEBIDA"] },
    },
    data: {
      id_local_estoque: preparadas.every(
        (p) => p.data.id_local_estoque === preparadas[0]?.data.id_local_estoque,
      )
        ? (preparadas[0]?.data.id_local_estoque ?? null)
        : null,
      id_setor_destino: preparadas.every(
        (p) => p.data.id_setor === preparadas[0]?.data.id_setor,
      )
        ? (preparadas[0]?.data.id_setor ?? null)
        : null,
      versao: { increment: 1 },
      justificativa_valores:
        justificativa === undefined ? n.justificativa_valores : justificativa,
    },
  })
  if (r.count !== 1) fail("A nota foi alterada durante a conferência.")
  await auditar(
    tx,
    ctx,
    "nota_fiscal",
    id,
    { versao: n.versao, itens: n.item_nota_fiscal.map((i) => i.id) },
    {
      versao: n.versao + 1,
      itens: mantidas,
      justificativa: justificativa ?? n.justificativa_valores,
    },
  )
}
export async function consultarConferencia(
  tx: Transaction,
  ctx: Contexto,
  id: number,
) {
  await conferir(tx, ctx, [["NOTAS_FISCAIS", "ler"]])
  const n = await nota(tx, ctx, id)
  const fisico = n.id_compra ? await carregarFisico(tx, ctx, n.id_compra) : null
  const soma = n.item_nota_fiscal.reduce(
    (s, i) => s.plus(i.valor_total),
    new Prisma.Decimal(0),
  )
  const pendencias: string[] = []
  if (!fisico)
    pendencias.push("Vincule uma compra antes de processar a entrada.")
  if (!n.item_nota_fiscal.length) pendencias.push("Cadastre os itens fiscais.")
  if (!soma.eq(n.valor_total))
    pendencias.push(
      "O somatório dos itens difere do total do documento; confira os valores antes de processar.",
    )
  if (fisico) pendencias.push(...fisico.pendencias)
  const itens = n.item_nota_fiscal.map((i) => {
    const compraItem = fisico?.compra.compra_itens.find(
      (c) => c.id === i.id_compra_item,
    )
    const valorReferencia = compraItem
      ? new Prisma.Decimal(i.quantidade)
          .mul(compraItem.valor_unitario)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      : null
    const divergenciaCompra =
      valorReferencia !== null && !valorReferencia.eq(i.valor_total)
    const faltas = []
    if (i.quantidade.lte(0))
      faltas.push("A quantidade fiscal deve ser positiva.")
    if (i.id_empresa !== ctx.idEmpresa || i.id_compra !== n.id_compra)
      faltas.push(
        "Confirme os vínculos desta linha fiscal com a empresa e a compra.",
      )
    if (
      !i.id_produto ||
      !i.id_compra_item ||
      !i.id_local_estoque ||
      !i.id_setor
    )
      faltas.push("Complete produto, item da compra, local e setor.")
    if (divergenciaCompra && !n.justificativa_valores)
      faltas.push("Justifique a diferença em relação aos valores da compra.")
    pendencias.push(...faltas.map((f) => `Item ${i.numero_item}: ${f}`))
    return {
      id: i.id,
      numeroItem: i.numero_item,
      codigo: i.codigo_produto,
      descricao: i.descricao_produto,
      idProduto: i.id_produto,
      idCompraItem: i.id_compra_item,
      idVariacao: i.id_variacao,
      idLocalEstoque: i.id_local_estoque,
      idSetor: i.id_setor,
      setorNome:
        i.setores?.id_empresa === ctx.idEmpresa ? i.setores.nome : null,
      localNome:
        i.locais_estoque?.id_empresa === ctx.idEmpresa
          ? i.locais_estoque.nome
          : null,
      quantidade: i.quantidade.toFixed(3),
      quantidadeEstoque: i.quantidade.toFixed(3),
      unidade: i.unidade,
      tipoValor: i.tipo_valor,
      valorUnitario: i.valor_unitario.toFixed(2),
      valorTotal: i.valor_total.toFixed(2),
      valorReferenciaCompra: valorReferencia?.toFixed(2) ?? null,
      divergenciaCompra,
      pendencias: faltas,
    }
  })
  const alocacoes = await tx.nota_item_entrada.findMany({
    where: { id_nota: id, id_empresa: ctx.idEmpresa },
    include: {
      compra_recebimento_linha: { include: { movimentacao_estoque: true } },
    },
  })
  const variacoes = fisico
    ? await tx.produto_variacoes.findMany({
        where: {
          id_empresa: ctx.idEmpresa,
          id_produto: {
            in: fisico.compra.compra_itens.map((i) => i.id_produto),
          },
          status: "ATIVO",
        },
        include: { cores: true, tamanhos: true },
      })
    : []
  if (
    n.entrada_processada &&
    (!n.item_nota_fiscal.length ||
      n.item_nota_fiscal.some(
        (i) =>
          !alocacoes
            .filter((a) => a.id_item_nota === i.id)
            .reduce((s, a) => s.plus(a.quantidade), new Prisma.Decimal(0))
            .eq(i.quantidade),
      ))
  )
    pendencias.push(
      "Entrada antiga marcada como processada sem vínculos quantitativos suficientes. Regularização necessária.",
    )
  const movimentos = fisico?.movimentos ?? []
  const usados = movimentos.length
    ? await tx.nota_item_entrada.groupBy({
        by: ["id_movimentacao"],
        where: { id_movimentacao: { in: movimentos.map((m) => m.id) } },
        _sum: { quantidade: true },
      })
    : []
  return {
    id: n.id,
    versao: n.versao,
    dataProcessamento: n.data_processamento?.toISOString() ?? null,
    justificativaValores: n.justificativa_valores,
    itens,
    somatorioItens: soma.toFixed(2),
    pendencias,
    entradaProcessada: n.entrada_processada,
    alocacoes: json(alocacoes),
    compraConferencia: fisico
      ? {
          id: fisico.compra.id,
          status: fisico.compra.status,
          idLocalEstoque: fisico.compra.id_local_estoque,
          itens: fisico.compra.compra_itens.map((i) => ({
            id: i.id,
            idProduto: i.id_produto,
            idCor: i.id_cor,
            idTamanho: i.id_tamanho,
            nome: i.produtos.nome,
            unidade: i.produtos.unidade,
            variacoes: variacoes
              .filter(
                (v) =>
                  v.id_produto === i.id_produto &&
                  variacaoAtivaNaEmpresa(v, ctx.idEmpresa),
              )
              .map((v) => ({
                id: v.id,
                idCor: v.id_cor,
                idTamanho: v.id_tamanho,
                nome: [v.cores?.nome, v.tamanhos?.nome]
                  .filter(Boolean)
                  .join(" / "),
              })),
            quantidade: i.quantidade.toFixed(3),
            recebida: (
              fisico.recebidos.get(i.id) ?? new Prisma.Decimal(0)
            ).toFixed(3),
            pendente: i.quantidade
              .minus(fisico.recebidos.get(i.id) ?? 0)
              .toFixed(3),
            valorUnitario: i.valor_unitario.toFixed(2),
          })),
          recebimentos: movimentos.map((m) => ({
            idMovimentacao: m.id,
            idCompraItem: fisico.porMovimento.get(m.id) ?? null,
            idProduto: m.id_produto,
            idVariacao: m.id_variacao,
            idLocalEstoque: m.id_local_estoque,
            idSetor: m.id_setor,
            quantidade: m.quantidade.toFixed(3),
            livre: m.quantidade
              .minus(
                usados.find((u) => u.id_movimentacao === m.id)?._sum
                  .quantidade ?? 0,
              )
              .toFixed(3),
            valorTotal: m.valor_total.toFixed(2),
            responsavel: m.id_usuario,
            data: m.data_movimentacao.toISOString(),
          })),
        }
      : null,
  }
}
export async function conferirItens(
  tx: Transaction,
  ctx: Contexto,
  id: number,
  input: ConferenciaNota,
) {
  await gravarItensNota(
    tx,
    ctx,
    id,
    input.itens,
    input.versaoEsperada,
    input.justificativaValores,
  )
  return { nota: await consultarConferencia(tx, ctx, id) }
}
export async function processarEntrada(
  tx: Transaction,
  ctx: Contexto,
  id: number,
  chave: string,
  input: ProcessamentoNota,
) {
  const exec = await executarNaTransacao(
    tx,
    ctx,
    chave,
    "PROCESSAR_NOTA_FISCAL",
    { id, ...input },
    [
      ["NOTAS_FISCAIS", "ler"],
      ["NOTAS_FISCAIS", "editar"],
      ["COMPRAS", "editar"],
      ["ESTOQUE", "criar"],
    ],
    async () => {
      const n = await nota(tx, ctx, id)
      if (n.status === "CANCELADA")
        fail("Nota cancelada não pode processar estoque.")
      if (n.entrada_processada) {
        const atual = await consultarConferencia(tx, ctx, id)
        if (atual.pendencias.length) fail(atual.pendencias.join(" "))
        return json({ nota: atual, jaProcessada: true })
      }
      if (n.versao !== input.versaoEsperada)
        fail(
          "A nota foi alterada. Recarregue a conferência antes de processar.",
        )
      const conferencia = await consultarConferencia(tx, ctx, id)
      if (conferencia.pendencias.length) fail(conferencia.pendencias.join(" "))
      if (!n.id_compra) throw new ComprasError(409, "Vincule a compra da nota.")
      await exigirFornecedor(tx, ctx, n.id_fornecedor)
      const fisico = await carregarFisico(tx, ctx, n.id_compra)
      if (
        !["EMITIDA", "ENTREGUE"].includes(fisico.compra.status) ||
        fisico.compra.id_fornecedor !== n.id_fornecedor ||
        fisico.compra.id_pedido_compra_legado !== n.id_pedido_compra
      )
        fail("Compra e fornecedor não aceitam o processamento fiscal.")
      if (
        input.linhas.length !== n.item_nota_fiscal.length ||
        input.linhas.some(
          (p) => !n.item_nota_fiscal.some((i) => i.id === p.idItem),
        )
      )
        throw new ComprasError(400, "Informe exatamente as linhas desta nota.")
      const planos = []
      for (const i of n.item_nota_fiscal) {
        const plano = input.linhas.find((p) => p.idItem === i.id)!
        const total = plano.recebimentos.reduce(
          (s, r) => s.plus(r.quantidade),
          new Prisma.Decimal(plano.novaQuantidade),
        )
        if (!total.eq(i.quantidade))
          throw new ComprasError(
            400,
            `Item ${i.numero_item}: quantidades novas e associadas devem corresponder à quantidade fiscal.`,
          )
        const compraItem = fisico.compra.compra_itens.find(
          (c) => c.id === i.id_compra_item,
        )!
        const produto = await tx.produtos.findFirst({
          where: {
            id: i.id_produto!,
            ...insumoDaEmpresa(ctx.idEmpresa),
            controla_estoque: true,
          },
        })
        if (
          !produto ||
          produto.id !== compraItem.id_produto ||
          produto.unidade.trim().toUpperCase() !== i.unidade
        )
          fail("Produto ou unidade da linha fiscal exige nova conferência.")
        await exigirLocal(tx, ctx, i.id_local_estoque!)
        await exigirSetor(tx, ctx, i.id_setor!)
        if (i.id_local_estoque !== fisico.compra.id_local_estoque)
          fail("O destino da nota difere do local da compra.")
        const variacao = await variacaoDoItem(
          tx,
          ctx,
          compraItem,
          i.id_variacao,
        )
        if (
          (variacao?.id ?? null) !== i.id_variacao ||
          (variacao?.id_cor ?? null) !== i.id_cor ||
          (variacao?.id_tamanho ?? null) !== i.id_tamanho
        )
          fail("Variação fiscal exige nova conferência.")
        if (
          !calcularValorLinha(
            i.quantidade.toFixed(3),
            i.valor_unitario.toFixed(2),
            i.tipo_valor,
          ).eq(i.valor_total)
        )
          fail("Valores da linha fiscal exigem nova conferência.")
        if (
          new Set(plano.recebimentos.map((r) => r.idMovimentacao)).size !==
          plano.recebimentos.length
        )
          throw new ComprasError(400, "Recebimento repetido na mesma linha.")
        planos.push({ item: i, plano })
      }
      const novas = planos.filter((p) =>
        new Prisma.Decimal(p.plano.novaQuantidade).gt(0),
      )
      const chaveInterna = `nf:${id}:${n.versao}`
      const criados = novas.length
        ? await receberFisico(
            tx,
            ctx,
            n.id_compra,
            novas.map((p) => ({
              idItemCompra: p.item.id_compra_item!,
              idVariacao: p.item.id_variacao ?? undefined,
              quantidade: p.plano.novaQuantidade,
              idSetorDestino: p.item.id_setor,
            })),
            chaveInterna,
            undefined,
            `Entrada da NF ${n.numero}`,
            novas.map((p) =>
              p.item.valor_total
                .mul(p.plano.novaQuantidade)
                .div(p.item.quantidade)
                .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
            ),
            "nota-fiscal",
          )
        : []
      const atualizado = await carregarFisico(tx, ctx, n.id_compra)
      const utilizados = new Map<number, Prisma.Decimal>()
      for (const { item, plano } of planos) {
        const index = novas.findIndex((p) => p.item.id === item.id)
        const alocar = [
          ...plano.recebimentos,
          ...(index >= 0
            ? [
                {
                  idMovimentacao: criados[index].idMovimentacao,
                  quantidade: plano.novaQuantidade,
                },
              ]
            : []),
        ]
        for (const r of alocar) {
          const m = await comprovarMovimento(
            tx,
            ctx,
            atualizado,
            r.idMovimentacao,
            item.id_compra_item!,
            item.id_variacao,
            item.id_local_estoque!,
            item.id_setor!,
          )
          const anterior = await tx.nota_item_entrada.aggregate({
            where: { id_movimentacao: m.id },
            _sum: { quantidade: true },
          })
          const total = new Prisma.Decimal(anterior._sum.quantidade ?? 0).plus(
            r.quantidade,
          )
          if (total.gt(m.quantidade))
            fail(
              "O recebimento já foi associado a outras linhas fiscais ou sua quantidade livre foi excedida.",
            )
          if (!utilizados.has(m.id))
            await vincularMovimento(
              tx,
              ctx,
              atualizado,
              m.id,
              item.id_compra_item!,
            )
          utilizados.set(m.id, total)
          const vinculo = await tx.nota_item_entrada.create({
            data: {
              id_item_nota: item.id,
              id_nota: id,
              id_empresa: ctx.idEmpresa,
              id_compra: n.id_compra,
              id_compra_item: item.id_compra_item!,
              id_produto: item.id_produto!,
              id_movimentacao: m.id,
              quantidade: r.quantidade,
            },
          })
          await auditar(tx, ctx, "nota_item_entrada", item.id, null, vinculo)
        }
      }
      const result = await tx.nota_fiscal.updateMany({
        where: {
          id,
          id_empresa: ctx.idEmpresa,
          versao: n.versao,
          entrada_processada: false,
          status: { not: "CANCELADA" },
        },
        data: {
          entrada_processada: true,
          status: "RECEBIDA",
          data_processamento: new Date(),
          data_recebimento: n.data_recebimento ?? new Date(),
          versao: { increment: 1 },
        },
      })
      if (result.count !== 1) fail("Nota alterada durante o processamento.")
      await auditar(
        tx,
        ctx,
        "nota_fiscal",
        id,
        { versao: n.versao, entradaProcessada: false },
        {
          versao: n.versao + 1,
          entradaProcessada: true,
          itens: n.item_nota_fiscal.map((i) => ({
            id: i.id,
            quantidade: i.quantidade,
          })),
          movimentos: [...utilizados.keys()],
        },
      )
      return json({
        nota: await consultarConferencia(tx, ctx, id),
        jaProcessada: false,
      })
    },
  )
  return { dados: exec.dados, repetido: !exec.criado }
}
