import "server-only"
import { createHash } from "node:crypto"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/api/errors"
import { disputaPersistencia } from "@/lib/prisma-concorrencia"
import { invalidConfirmedMovements } from "../../../modules/contas_receber/repository"
import { auditFinancial } from "../../../modules/financeiro/auditoria"
import {
  conferirAcessoRecebimento,
  type ContextoRecebimento,
} from "./recebimentos.authorization"
import { formasRecebimento, type RecebimentoInput } from "./recebimentos.schema"

type Tx = Prisma.TransactionClient
type Titulo = Prisma.contas_receberGetPayload<object>
const limite = new Prisma.Decimal("9999999999999.99")
const civil = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
export function conferirValorRecebido(
  total: Prisma.Decimal,
  recebido: Prisma.Decimal,
  valor: string,
) {
  const saldo = total.minus(recebido)
  const pagamento = new Prisma.Decimal(valor)
  if (
    !total.isFinite() ||
    total.lte(0) ||
    total.gt(limite) ||
    recebido.lt(0) ||
    saldo.lt(0)
  )
    throw new ConflictError("Valores do título exigem regularização.")
  if (
    !pagamento.isFinite() ||
    pagamento.lte(0) ||
    pagamento.decimalPlaces() > 2 ||
    pagamento.gt(limite)
  )
    throw new ValidationError(
      "Informe um valor positivo com até duas casas decimais.",
    )
  if (saldo.isZero()) throw new ConflictError("O título já está quitado.")
  if (pagamento.gt(saldo))
    throw new ConflictError("O valor recebido excede o saldo atual do título.")
  return {
    saldo: saldo.minus(pagamento),
    situacao: saldo.eq(pagamento) ? ("PAGO" as const) : ("PARCIAL" as const),
  }
}
async function titulo(tx: Tx, ctx: ContextoRecebimento, id: number) {
  const row = await tx.contas_receber.findFirst({
    where: { id, id_empresa: ctx.idEmpresa },
    include: {
      venda: {
        select: {
          id_pedido_cliente: true,
          status: true,
          status_financeiro: true,
          pedido_cliente: { select: { status: true } },
        },
      },
    },
  })
  if (!row) throw new NotFoundError("Título não encontrado na empresa ativa.")
  return row
}
async function recebidoValido(tx: Tx, row: Titulo) {
  const pagamentos = await tx.pagamentos_receber.aggregate({
    where: { id_conta_receber: row.id, status: "CONFIRMADO" },
    _sum: { valor: true },
    _min: { valor: true, id_empresa: true },
    _max: { id_empresa: true },
    _count: { _all: true },
  })
  if (
    pagamentos._count._all > 0 &&
    (pagamentos._min.id_empresa !== row.id_empresa ||
      pagamentos._max.id_empresa !== row.id_empresa ||
      !pagamentos._min.valor?.gt(0) ||
      (await invalidConfirmedMovements(row.id, row.id_empresa, tx)))
  )
    throw new ConflictError(
      "Há recebimentos sem comprovação financeira íntegra. Regularização necessária.",
    )
  // Não existe serviço de estorno no contrato atual. Um cancelamento por SQL
  // que deixou dinheiro no extrato não autoriza nova entrada automática.
  if (
    await tx.pagamentos_receber.count({
      where: {
        id_conta_receber: row.id,
        status: "CANCELADO",
        movimentacoes_financeiras: { some: {} },
      },
    })
  )
    throw new ConflictError(
      "Há pagamento cancelado com movimento financeiro. Regularize o estorno antes de receber.",
    )
  const valor = pagamentos._sum.valor ?? new Prisma.Decimal(0)
  const saldo = row.valor_final.minus(valor)
  if (
    !row.valor_final.gt(0) ||
    row.valor_final.gt(limite) ||
    saldo.lt(0) ||
    (row.saldo !== null && !row.saldo.eq(saldo)) ||
    (saldo.isZero() && row.situacao !== "PAGO") ||
    (row.situacao === "CANCELADO" && valor.gt(0)) ||
    (row.situacao === "PAGO" && !saldo.isZero()) ||
    (row.situacao === "PARCIAL" && (valor.isZero() || saldo.isZero())) ||
    (row.situacao === "ABERTO" && !valor.isZero())
  )
    throw new ConflictError(
      "Saldo e situação do título divergem do histórico. Regularização necessária.",
    )
  return { valor, saldo }
}
function serializarPagamento(
  row: Prisma.pagamentos_receberGetPayload<{
    include: {
      movimentacoes_financeiras: {
        include: { contas_bancarias: { select: { nome: true } } }
      }
      usuario_empresa: { include: { usuarios: { select: { nome: true } } } }
    }
  }>,
) {
  return {
    id: row.id,
    valor: row.valor.toFixed(2),
    data: civil(row.data_pagamento),
    formaPagamento: row.forma_pagamento,
    situacao: row.status,
    referencia: row.referencia,
    observacao: row.observacao,
    cadastradoEm: row.data_cadastro.toISOString(),
    responsavel: row.usuario_empresa?.usuarios.nome ?? null,
    idContaBancaria: row.id_conta_bancaria,
    conta: row.movimentacoes_financeiras[0]?.contas_bancarias.nome ?? null,
  }
}
const includePagamento = {
  movimentacoes_financeiras: {
    include: { contas_bancarias: { select: { nome: true } } },
  },
  usuario_empresa: { include: { usuarios: { select: { nome: true } } } },
} as const

export async function consultarRecebimentos(
  ctx: ContextoRecebimento,
  id: number,
  pagina: number,
  limitePagina: number,
) {
  return prisma.$transaction(
    async (tx) => {
      await conferirAcessoRecebimento(tx, ctx, false)
      const row = await titulo(tx, ctx, id)
      const total = await recebidoValido(tx, row)
      const [historico, quantidade] = await Promise.all([
        tx.pagamentos_receber.findMany({
          where: { id_conta_receber: id, id_empresa: ctx.idEmpresa },
          include: includePagamento,
          orderBy: [{ data_cadastro: "desc" }, { id: "desc" }],
          take: limitePagina,
          skip: (pagina - 1) * limitePagina,
        }),
        tx.pagamentos_receber.count({
          where: { id_conta_receber: id, id_empresa: ctx.idEmpresa },
        }),
      ])
      return {
        id,
        idPedido: row.venda.id_pedido_cliente,
        idVenda: row.id_venda,
        parcela: row.numero_parcela,
        totalParcelas: row.total_parcelas,
        descricao: row.descricao,
        valorOriginal: row.valor_original.toFixed(2),
        valorDevido: row.valor_final.toFixed(2),
        valorRecebido: total.valor.toFixed(2),
        saldo: total.saldo.toFixed(2),
        vencimento: row.data_vencimento.toISOString().slice(0, 10),
        situacao: row.situacao,
        vencido:
          total.saldo.gt(0) &&
          row.data_vencimento.toISOString().slice(0, 10) < civil(new Date()),
        pagamentos: historico.map(serializarPagamento),
        paginacao: {
          pagina,
          limite: limitePagina,
          totalRegistros: quantidade,
          totalPaginas: Math.ceil(quantidade / limitePagina),
        },
      }
    },
    { isolationLevel: "RepeatableRead" },
  )
}
export async function opcoesRecebimento(ctx: ContextoRecebimento) {
  return prisma.$transaction(
    async (tx) => {
      await conferirAcessoRecebimento(tx, ctx, false)
      return {
        formasPagamento: formasRecebimento,
        contas: await tx.contas_bancarias.findMany({
          where: { id_empresa: ctx.idEmpresa, status: "ATIVA" },
          select: { id: true, nome: true, tipo: true },
          orderBy: [{ nome: "asc" }, { id: "asc" }],
        }),
      }
    },
    { isolationLevel: "RepeatableRead" },
  )
}
export async function registrarRecebimento(
  ctx: ContextoRecebimento,
  id: number,
  chave: string,
  input: RecebimentoInput,
) {
  const dados = {
    ...input,
    valor: new Prisma.Decimal(input.valor).toFixed(2),
    referencia: input.referencia ?? null,
    observacao: input.observacao ?? null,
  }
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        idTitulo: id,
        idUsuario: ctx.idUsuario,
        valor: dados.valor,
        data: dados.data,
        formaPagamento: dados.formaPagamento,
        idContaBancaria: dados.idContaBancaria,
        referencia: dados.referencia,
        observacao: dados.observacao,
      }),
    )
    .digest("hex")
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const empresas = await tx.$queryRaw<
            { id: number }[]
          >`SELECT id FROM empresas WHERE id = ${ctx.idEmpresa} AND status = 'ATIVA' FOR UPDATE`
          if (!empresas.length)
            throw new NotFoundError("Empresa ativa não encontrada.")
          await conferirAcessoRecebimento(tx, ctx, true)
          await tx.$queryRaw`SELECT id FROM contas_receber WHERE id = ${id} AND id_empresa = ${ctx.idEmpresa} FOR UPDATE`
          const row = await titulo(tx, ctx, id)
          const anterior = await tx.pagamentos_receber.findUnique({
            where: {
              id_empresa_chave_idempotencia: {
                id_empresa: ctx.idEmpresa,
                chave_idempotencia: chave,
              },
            },
            include: { movimentacoes_financeiras: true },
          })
          if (anterior) {
            if (
              anterior.hash_requisicao !== hash ||
              anterior.id_usuario !== ctx.idUsuario ||
              anterior.id_conta_receber !== id
            )
              throw new ConflictError(
                "A chave já identifica outro recebimento. Preserve a chave e os dados ao repetir uma tentativa.",
              )
            const movimento = anterior.movimentacoes_financeiras[0]
            if (
              anterior.status !== "CONFIRMADO" ||
              anterior.movimentacoes_financeiras.length !== 1 ||
              !movimento ||
              movimento.id_empresa !== ctx.idEmpresa ||
              movimento.id_conta_bancaria !== anterior.id_conta_bancaria ||
              movimento.origem !== "RECEBIMENTO" ||
              movimento.tipo !== "ENTRADA" ||
              !movimento.valor.eq(anterior.valor)
            )
              throw new ConflictError(
                "O recebimento anterior exige regularização; não será registrado novamente.",
              )
            const total = await recebidoValido(tx, row)
            return {
              idPagamento: anterior.id,
              idTitulo: id,
              valor: anterior.valor.toFixed(2),
              saldo: total.saldo.toFixed(2),
              situacao: row.situacao,
              criado: false,
            }
          }
          if (
            row.situacao === "CANCELADO" ||
            row.venda.status === "CANCELADA" ||
            row.venda.status_financeiro === "CANCELADA" ||
            row.venda.pedido_cliente?.status === "CANCELADO"
          )
            throw new ConflictError(
              "Título ou documento de origem cancelado não permite recebimento.",
            )
          const conta = await tx.contas_bancarias.findFirst({
            where: {
              id: input.idContaBancaria,
              id_empresa: ctx.idEmpresa,
              status: "ATIVA",
            },
          })
          if (!conta)
            throw new NotFoundError(
              "Conta financeira ativa não encontrada na empresa.",
            )
          // Datas são dias civis do ERP; meio-dia UTC evita mudar o dia no fuso.
          const hoje = civil(new Date())
          if (input.data > hoje || input.data < civil(row.data_lancamento))
            throw new ValidationError(
              "A data deve estar entre o lançamento do título e hoje.",
            )
          const recebido = await recebidoValido(tx, row)
          const baixa = conferirValorRecebido(
            row.valor_final,
            recebido.valor,
            input.valor,
          )
          const pagamento = await tx.pagamentos_receber.create({
            data: {
              id_empresa: ctx.idEmpresa,
              id_conta_receber: id,
              id_usuario: ctx.idUsuario,
              id_conta_bancaria: conta.id,
              chave_idempotencia: chave,
              hash_requisicao: hash,
              valor: dados.valor,
              data_pagamento: new Date(`${input.data}T12:00:00.000Z`),
              forma_pagamento: input.formaPagamento,
              referencia: dados.referencia,
              observacao: dados.observacao,
              status: "CONFIRMADO",
            },
          })
          const movimento = await tx.movimentacoes_financeiras.create({
            data: {
              id_empresa: ctx.idEmpresa,
              id_conta_bancaria: conta.id,
              id_pagamento_receber: pagamento.id,
              tipo: "ENTRADA",
              origem: "RECEBIMENTO",
              descricao: `Recebimento do título ${id}, parcela ${row.numero_parcela}/${row.total_parcelas}`,
              valor: dados.valor,
              data_movimentacao: pagamento.data_pagamento,
              observacao: dados.observacao,
            },
          })
          const depois = await tx.contas_receber.update({
            where: { id, id_empresa: ctx.idEmpresa },
            data: {
              saldo: baixa.saldo,
              situacao: baixa.situacao,
              data_atualizacao: new Date(),
            },
          })
          for (const [tabela, registro] of [
            ["pagamentos_receber", pagamento],
            ["movimentacoes_financeiras", movimento],
          ] as const)
            await tx.auditoria.create({
              data: {
                id_empresa: ctx.idEmpresa,
                id_usuario: ctx.idUsuario,
                tabela,
                id_registro: registro.id,
                acao: "INSERT",
                dados_novos: JSON.stringify(registro),
              },
            })
          await auditFinancial(tx, ctx, "contas_receber", row, depois, "BAIXA")
          return {
            idPagamento: pagamento.id,
            idTitulo: id,
            valor: dados.valor,
            saldo: baixa.saldo.toFixed(2),
            situacao: baixa.situacao,
            criado: true,
          }
        },
        { isolationLevel: "Serializable", maxWait: 10000, timeout: 15000 },
      )
    } catch (erro) {
      if (!disputaPersistencia(erro)) throw erro
      if (tentativa === 2)
        throw new ConflictError(
          "Disputa entre recebimentos. Consulte o título ou repita com a mesma chave e os mesmos dados.",
        )
    }
  }
  throw new ConflictError("Recebimento não confirmado.")
}
