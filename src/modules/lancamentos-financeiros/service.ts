import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { HttpError, NotFoundError, ValidationError } from "@/lib/api/errors"
import {
  conferirAcessoRecebimento,
  type ContextoRecebimento,
} from "@/modules/recebimentos/recebimentos.authorization"
import {
  auditar,
  chaveMovimento,
  executar,
  type Tx,
  type Exigencia,
} from "@/modules/reservas/operacoes"
import {
  dataCivil,
  inicioDiaFinanceiro,
  saldoAte,
  type ConsultaLancamentos,
  type LancamentoManual,
} from "./schema"
import { totalLiquido } from "./valores"

// Prisma aplica LIKE ao contains no MySQL. Preserve a busca literal.
const trechoLiteral = (texto: string) =>
  texto.replace(/[\\%_]/g, (valor) => "\\" + valor)

const categoria = {
  id: true,
  id_empresa: true,
  nome: true,
  tipo: true,
  status: true,
} as const
const titulo = {
  id: true,
  id_empresa: true,
  categoria_financeira: { select: categoria },
} as const
const movimentoSelect = {
  id: true,
  descricao: true,
  valor: true,
  tipo: true,
  origem: true,
  data_movimentacao: true,
  observacao: true,
  contas_bancarias: {
    select: { id: true, id_empresa: true, nome: true, status: true },
  },
  categoria_financeira: { select: categoria },
  pagamentos_receber: {
    select: {
      id: true,
      id_empresa: true,
      status: true,
      titulo_na_empresa: { select: titulo },
    },
  },
  pagamentos_pagar: {
    select: {
      id: true,
      id_empresa: true,
      status: true,
      contas_pagar: { select: titulo },
    },
  },
  despesas: {
    select: {
      id: true,
      id_empresa: true,
      categoria_financeira: { select: categoria },
    },
  },
  pedido_reembolso: {
    select: {
      id: true,
      id_empresa: true,
      pedido_credito_receber: {
        select: { id_empresa: true, contas_receber: { select: titulo } },
      },
    },
  },
} satisfies Prisma.movimentacoes_financeirasSelect
type Movimento = Prisma.movimentacoes_financeirasGetPayload<{
  select: typeof movimentoSelect
}>

function apresentar(m: Movimento, empresa: number) {
  const noContexto = <T extends { id_empresa: number }>(
    registro: T | null | undefined,
  ) => (registro?.id_empresa === empresa ? registro : null)
  const receber =
    m.origem === "RECEBIMENTO" ? noContexto(m.pagamentos_receber) : null
  const pagar = m.origem === "PAGAMENTO" ? noContexto(m.pagamentos_pagar) : null
  const despesa = m.origem === "DESPESA" ? noContexto(m.despesas) : null
  const reembolso = noContexto(m.pedido_reembolso)
  const credito = noContexto(reembolso?.pedido_credito_receber)
  const tituloReceber = noContexto(
    receber?.titulo_na_empresa ?? credito?.contas_receber,
  )
  const tituloPagar = noContexto(pagar?.contas_pagar)
  const cat = noContexto(
    m.categoria_financeira ??
      tituloReceber?.categoria_financeira ??
      tituloPagar?.categoria_financeira ??
      despesa?.categoria_financeira,
  )
  return {
    id: m.id,
    descricao: m.descricao,
    observacao: m.observacao,
    valor: m.valor.toFixed(2),
    tipo: m.tipo,
    origem: reembolso ? ("REEMBOLSO" as const) : m.origem,
    data: dataCivil(m.data_movimentacao),
    conta: {
      id: m.contas_bancarias.id,
      nome: m.contas_bancarias.nome,
      status: m.contas_bancarias.status,
    },
    categoria: cat
      ? { id: cat.id, nome: cat.nome, tipo: cat.tipo, status: cat.status }
      : null,
    referencia: reembolso
      ? {
          id: reembolso.id,
          tipo: "REEMBOLSO",
          titulo: tituloReceber?.id ?? null,
          status: null,
        }
      : receber
        ? {
            id: receber.id,
            tipo: "RECEBIMENTO",
            titulo: tituloReceber?.id ?? null,
            status: receber.status,
          }
        : pagar
          ? {
              id: pagar.id,
              tipo: "PAGAMENTO",
              titulo: tituloPagar?.id ?? null,
              status: pagar.status,
            }
          : despesa
            ? { id: despesa.id, tipo: "DESPESA", titulo: null, status: null }
            : null,
  }
}

function escopoEmpresa(
  idEmpresa: number,
): Prisma.movimentacoes_financeirasWhereInput {
  return { id_empresa: idEmpresa, contas_bancarias: { id_empresa: idEmpresa } }
}

function filtroCategoria(
  empresa: number,
  id: number,
): Prisma.movimentacoes_financeirasWhereInput {
  const escopo = { id_empresa: empresa }
  const doTitulo = { ...escopo, id_categoria: id, categoria_financeira: escopo }
  return {
    OR: [
      { id_categoria: id, categoria_financeira: escopo },
      {
        id_categoria: null,
        OR: [
          {
            origem: "RECEBIMENTO",
            id_pedido_reembolso: null,
            pagamentos_receber: { ...escopo, titulo_na_empresa: doTitulo },
          },
          {
            origem: "PAGAMENTO",
            id_pedido_reembolso: null,
            pagamentos_pagar: { ...escopo, contas_pagar: doTitulo },
          },
          {
            origem: "DESPESA",
            id_pedido_reembolso: null,
            despesas: { ...doTitulo },
          },
          {
            pedido_reembolso: {
              ...escopo,
              pedido_credito_receber: { ...escopo, contas_receber: doTitulo },
            },
          },
        ],
      },
    ],
  }
}

type Total = {
  tipo: "ENTRADA" | "SAIDA"
  _sum: { valor: Prisma.Decimal | null }
}
function apurar(totais: Total[]) {
  const valor = (tipo: Total["tipo"]) =>
    totais.find((t) => t.tipo === tipo)?._sum.valor?.toFixed(2) ?? "0.00"
  return { entradas: valor("ENTRADA"), saidas: valor("SAIDA") }
}

async function saldoConta(
  tx: Tx,
  ctx: ContextoRecebimento,
  id: number,
  agora: Date,
) {
  const conta = await tx.contas_bancarias.findFirst({
    where: { id, id_empresa: ctx.idEmpresa },
    select: { id: true, nome: true, saldo_inicial: true, status: true },
  })
  if (!conta)
    throw new NotFoundError("Conta bancária não encontrada na empresa.")
  const totais = await tx.movimentacoes_financeiras.groupBy({
    by: ["tipo"],
    where: {
      ...escopoEmpresa(ctx.idEmpresa),
      id_conta_bancaria: id,
      data_movimentacao: { lt: saldoAte(dataCivil(agora)) },
    },
    _sum: { valor: true },
  })
  const { entradas, saidas } = apurar(totais)
  return {
    id: conta.id,
    nome: conta.nome,
    status: conta.status,
    saldoInicial: conta.saldo_inicial.toFixed(2),
    saldoAtual: totalLiquido(entradas, saidas, conta.saldo_inicial.toFixed(2)),
    dataReferencia: dataCivil(agora),
  }
}

const tamanhoPagina = 25
export function listarLancamentos(
  ctx: ContextoRecebimento,
  f: ConsultaLancamentos,
  agora = new Date(),
) {
  return prisma.$transaction(
    async (tx) => {
      await conferirAcessoRecebimento(tx, ctx, false)
      const empresa = ctx.idEmpresa
      const conta = f.idConta
        ? await saldoConta(tx, ctx, f.idConta, agora)
        : null
      if (
        f.idCategoria &&
        !(await tx.categoria_financeira.findFirst({
          where: { id: f.idCategoria, id_empresa: empresa },
          select: { id: true },
        }))
      )
        throw new NotFoundError(
          "Categoria financeira não encontrada na empresa.",
        )
      const where: Prisma.movimentacoes_financeirasWhereInput = {
        ...escopoEmpresa(empresa),
        data_movimentacao: {
          gte: inicioDiaFinanceiro(f.de),
          lt: saldoAte(f.ate),
        },
        ...(f.idConta ? { id_conta_bancaria: f.idConta } : {}),
        ...(f.tipo ? { tipo: f.tipo } : {}),
        ...(f.origem === "REEMBOLSO"
          ? { pedido_reembolso: { is: { id_empresa: empresa } } }
          : f.origem
            ? { origem: f.origem, id_pedido_reembolso: null }
            : {}),
        AND: [
          ...(f.idCategoria ? [filtroCategoria(empresa, f.idCategoria)] : []),
          ...(f.busca
            ? [
                {
                  OR: [
                    { descricao: { contains: trechoLiteral(f.busca) } },
                    { observacao: { contains: trechoLiteral(f.busca) } },
                  ],
                },
              ]
            : []),
        ],
      }
      const [total, totais] = await Promise.all([
        tx.movimentacoes_financeiras.count({ where }),
        tx.movimentacoes_financeiras.groupBy({
          by: ["tipo"],
          where,
          _sum: { valor: true },
        }),
      ])
      const totalPaginasReais = Math.ceil(total / tamanhoPagina)
      const totalPaginas = Math.min(totalPaginasReais, 4001)
      const pagina = Math.min(f.pagina, Math.max(1, totalPaginas))
      const linhas = await tx.movimentacoes_financeiras.findMany({
        where,
        select: movimentoSelect,
        orderBy: [{ data_movimentacao: "desc" }, { id: "desc" }],
        take: tamanhoPagina,
        skip: (pagina - 1) * tamanhoPagina,
      })
      const { entradas, saidas } = apurar(totais)
      return {
        dados: linhas.map((m) => apresentar(m, empresa)),
        conta,
        resumo: {
          entradas,
          saidas,
          liquido: totalLiquido(entradas, saidas),
        },
        paginacao: {
          pagina,
          limite: tamanhoPagina,
          total,
          totalPaginas,
          totalPaginasReais,
        },
      }
    },
    { isolationLevel: "RepeatableRead", timeout: 15_000 },
  )
}

export function detalheLancamento(ctx: ContextoRecebimento, id: number) {
  return prisma.$transaction(
    async (tx) => {
      await conferirAcessoRecebimento(tx, ctx, false)
      const m = await tx.movimentacoes_financeiras.findFirst({
        where: { ...escopoEmpresa(ctx.idEmpresa), id },
        select: movimentoSelect,
      })
      if (!m)
        throw new NotFoundError(
          "Lançamento financeiro não encontrado na empresa.",
        )
      return apresentar(m, ctx.idEmpresa)
    },
    { isolationLevel: "RepeatableRead" },
  )
}

export function consultarOpcoesLancamentos(
  ctx: ContextoRecebimento,
  busca: { conta?: string; categoria?: string },
) {
  return prisma.$transaction(
    async (tx) => {
      await conferirAcessoRecebimento(tx, ctx, false)
      const empresa = { id_empresa: ctx.idEmpresa }
      const [contas, categorias, v] = await Promise.all([
        tx.contas_bancarias.findMany({
          where: {
            ...empresa,
            ...(busca.conta
              ? { nome: { contains: trechoLiteral(busca.conta) } }
              : {}),
          },
          select: { id: true, nome: true, status: true },
          take: 501,
          orderBy: [{ nome: "asc" }, { id: "asc" }],
        }),
        tx.categoria_financeira.findMany({
          where: {
            ...empresa,
            ...(busca.categoria
              ? { nome: { contains: trechoLiteral(busca.categoria) } }
              : {}),
          },
          select: { id: true, nome: true, tipo: true, status: true },
          take: 501,
          orderBy: [{ nome: "asc" }, { id: "asc" }],
        }),
        tx.usuario_empresa.findFirstOrThrow({
          where: { ...empresa, id_usuario: ctx.idUsuario, status: "ATIVO" },
          select: {
            nivel_acesso: true,
            usuarios: { select: { nivel_acesso: true } },
            permissoes_usuario: {
              where: { recurso: "FINANCEIRO" },
              select: { pode_criar: true },
            },
          },
        }),
      ])
      return {
        contas: contas.slice(0, 500),
        categorias: categorias.slice(0, 500),
        maisContas: contas.length > 500,
        maisCategorias: categorias.length > 500,
        podeCriar:
          v.nivel_acesso === "EMPRESA" ||
          v.usuarios.nivel_acesso === "ADMIN" ||
          !!v.permissoes_usuario[0]?.pode_criar,
      }
    },
    { isolationLevel: "RepeatableRead" },
  )
}

type Confirmacao =
  | { confirmada: true; lancamento: ReturnType<typeof apresentar> }
  | { confirmada: false; status: number; mensagem: string }
class LancamentoRecusado extends Error {
  constructor(readonly recusa: HttpError) {
    super(recusa.message)
  }
}

export async function criarLancamento(
  ctx: ContextoRecebimento,
  chave: string,
  dados: LancamentoManual,
) {
  const valor = new Prisma.Decimal(dados.valor).toFixed(2)
  const identidade = chaveMovimento("lancamento-financeiro", chave)
  const tipo = "LANCAMENTO_FINANCEIRO_MANUAL"
  const input = { ...dados, valor }
  const exigencias: Exigencia[] = [
    ["FINANCEIRO", "ler"],
    ["FINANCEIRO", "criar"],
  ]
  try {
    return await executar<Confirmacao>(
      ctx,
      identidade,
      tipo,
      input,
      exigencias,
      async (tx) => {
        try {
          const lancamento = await gravarLancamento(tx, ctx, input)
          return { confirmada: true, lancamento }
        } catch (erro) {
          if (erro instanceof HttpError && [400, 404].includes(erro.status))
            throw new LancamentoRecusado(erro)
          throw erro
        }
      },
    )
  } catch (erro) {
    if (!(erro instanceof LancamentoRecusado)) throw erro
    // Com o rollback concluído, a nova transação confirma a recusa ou recupera
    // o eventual lançamento que uma chamada concorrente já tenha registrado.
    return executar<Confirmacao>(
      ctx,
      identidade,
      tipo,
      input,
      exigencias,
      async () => ({
        confirmada: false,
        status: erro.recusa.status,
        mensagem: erro.recusa.message,
      }),
    )
  }
}

async function gravarLancamento(
  tx: Tx,
  ctx: ContextoRecebimento,
  dados: LancamentoManual,
) {
  // Segue o lock de empresa do ERP e prende os cadastros até o commit.
  const contas = await tx.$queryRaw<
    { id: number }[]
  >`SELECT id FROM contas_bancarias WHERE id=${dados.idConta} AND id_empresa=${ctx.idEmpresa} FOR UPDATE`
  if (!contas.length)
    throw new NotFoundError("Conta bancária não encontrada na empresa.")
  const conta = await tx.contas_bancarias.findFirst({
    where: { id: dados.idConta, id_empresa: ctx.idEmpresa, status: "ATIVA" },
    select: { id: true, data_cadastro: true },
  })
  if (!conta) throw new ValidationError("Selecione uma conta bancária ativa.")
  const categorias = await tx.$queryRaw<
    { id: number }[]
  >`SELECT id FROM categoria_financeira WHERE id=${dados.idCategoria} AND id_empresa=${ctx.idEmpresa} FOR UPDATE`
  if (!categorias.length)
    throw new NotFoundError("Categoria financeira não encontrada na empresa.")
  const categoria = await tx.categoria_financeira.findFirst({
    where: {
      id: dados.idCategoria,
      id_empresa: ctx.idEmpresa,
      status: "ATIVA",
      tipo: { in: ["AMBOS", dados.tipo === "ENTRADA" ? "RECEITA" : "DESPESA"] },
    },
    select: { id: true },
  })
  if (!categoria)
    throw new ValidationError(
      "Selecione uma categoria ativa compatível com o tipo.",
    )
  if (
    dados.data > dataCivil(new Date()) ||
    dados.data < dataCivil(conta.data_cadastro)
  )
    throw new ValidationError(
      "A data do lançamento deve estar entre o cadastro da conta e hoje.",
    )
  const linha = await tx.movimentacoes_financeiras.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_conta_bancaria: conta.id,
      id_categoria: categoria.id,
      tipo: dados.tipo,
      origem: "AJUSTE",
      valor: dados.valor,
      descricao: dados.descricao,
      data_movimentacao: new Date(dados.data + "T12:00:00.000Z"),
      observacao: dados.observacao,
    },
    select: movimentoSelect,
  })
  const dto = apresentar(linha, ctx.idEmpresa)
  await auditar(tx, ctx, "movimentacoes_financeiras", linha.id, null, dto)
  return dto
}
