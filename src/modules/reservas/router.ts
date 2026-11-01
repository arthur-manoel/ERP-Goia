import "server-only"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/authorize"
import {
  HttpError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from "@/lib/api/errors"
import { readQuery, validate } from "@/lib/api/http"
import { enforceRateLimit } from "@/lib/api/rate-limit"
import { lerJson } from "@/modules/movimentacoes-estoque/router"
import { chaveRecebimento } from "@/modules/recebimentos/recebimentos.schema"
import {
  autorizar,
  conferir,
  executar,
  auditar,
  type Exigencia,
} from "./operacoes"
import * as schemas from "./reservas.schema"
import { reservar, restante, finalizarReserva } from "./reservas.service"
import {
  confirmarEntrega,
  consumirMaterial,
  enviarTransferencia,
  receberTransferencia,
} from "./fluxo.service"

type Operacao =
  | "fechamento"
  | "reservas"
  | "detalhe"
  | "liberar"
  | "confirmar"
  | "entregar"
  | "consumir"
  | "transferir"
  | "receberTransferencia"
  | "opcoes"
  | "pedido"
  | "producao"
  | "transferencias"
const headers = { "Cache-Control": "private, no-store" }
const textoJson = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue
export async function operacoesHandler(
  request: Request,
  op: Operacao,
  rawId?: string,
) {
  try {
    const escrita = request.method === "POST"
    const exigencias: Exigencia[] = [["ESTOQUE", "ler"]]
    if (escrita) exigencias.push(["ESTOQUE", "editar"])
    if (["pedido", "confirmar", "entregar", "fechamento"].includes(op))
      exigencias.push(["PEDIDOS", escrita ? "editar" : "ler"])
    if (["producao", "consumir"].includes(op))
      exigencias.push(["ORDENS_PRODUCAO", escrita ? "editar" : "ler"])
    const ctx = await autorizar(request, exigencias)
    if (ctx instanceof Response) {
      ctx.headers.set("Cache-Control", "private, no-store")
      return ctx
    }
    enforceRateLimit(
      request,
      {
        scope: `operacoes-estoque:${escrita ? "write" : "read"}`,
        windowMs: 60000,
        limit: escrita ? 30 : 120,
      },
      String(ctx.idUsuario),
    )
    const id =
      rawId === undefined
        ? undefined
        : validate(
            z
              .string()
              .regex(/^[1-9]\d{0,9}$/)
              .transform(Number)
              .pipe(schemas.id),
            rawId,
          )
    if (!escrita) {
      const data = await prisma.$transaction(
        async (tx) => {
          await conferir(tx, ctx, exigencias)
          if (op === "fechamento") {
            if (new URL(request.url).search)
              throw new ValidationError("Não informe filtros.")
            await conferir(tx, ctx, [["PEDIDOS", "editar"]])
            const pedido = await tx.pedido_cliente.findFirst({
              where: { id, id_empresa: ctx.idEmpresa },
              select: { id: true },
            })
            if (!pedido) throw new NotFoundError("Pedido não encontrado.")
            return tx.categoria_financeira.findMany({
              where: {
                id_empresa: ctx.idEmpresa,
                status: "ATIVA",
                tipo: { in: ["RECEITA", "AMBOS"] },
              },
              select: { id: true, nome: true },
              orderBy: [{ nome: "asc" }, { id: "asc" }],
            })
          }
          if (op === "opcoes") {
            const filtro = validate(
              z.strictObject({ busca: z.string().trim().max(100).default("") }),
              readQuery(request),
            )
            const [produtos, locais, setores] = await Promise.all([
              tx.produtos.findMany({
                where: {
                  status: "ATIVO",
                  controla_estoque: true,
                  nome: { contains: filtro.busca },
                  produto_empresa: {
                    some: { id_empresa: ctx.idEmpresa, status: "ATIVO" },
                  },
                },
                take: 50,
                orderBy: [{ nome: "asc" }, { id: "asc" }],
                select: {
                  id: true,
                  nome: true,
                  unidade: true,
                  produto_variacoes: {
                    where: { id_empresa: ctx.idEmpresa, status: "ATIVO" },
                    select: {
                      id: true,
                      cores: { select: { nome: true } },
                      tamanhos: { select: { nome: true } },
                    },
                  },
                  estoque: {
                    where: { id_empresa: ctx.idEmpresa },
                    include: { estoque_variacao: true },
                  },
                },
              }),
              tx.locais_estoque.findMany({
                where: { id_empresa: ctx.idEmpresa, status: "ATIVO" },
                select: { id: true, nome: true },
                orderBy: { id: "asc" },
              }),
              tx.setores.findMany({
                where: { id_empresa: ctx.idEmpresa, status: "ATIVO" },
                select: { id: true, nome: true },
                orderBy: { id: "asc" },
              }),
            ])
            return textoJson({ produtos, locais, setores, limiteProdutos: 50 })
          }
          if (op === "pedido") {
            if (new URL(request.url).search)
              throw new ValidationError("Não informe filtros no detalhe.")
            const pedido = await tx.pedido_cliente.findFirst({
              where: { id, id_empresa: ctx.idEmpresa },
              select: {
                id: true,
                numero: true,
                status: true,
                versao: true,
                pedido_cliente_fechamento: { select: { id: true } },
                pedido_cliente_item: {
                  select: {
                    id: true,
                    id_produto: true,
                    id_variacao: true,
                    descricao: true,
                    unidade: true,
                    quantidade: true,
                    reserva_estoque: true,
                    pedido_cliente_entrega_item: {
                      include: { pedido_cliente_entrega: true },
                    },
                  },
                },
              },
            })
            if (!pedido) throw new NotFoundError("Pedido não encontrado.")
            return textoJson(pedido)
          }
          if (op === "producao") {
            if (new URL(request.url).search)
              throw new ValidationError("Não informe filtros no detalhe.")
            const ordem = await tx.ordem_producao.findFirst({
              where: { id, id_empresa: ctx.idEmpresa },
              include: {
                ordem_producao_item: {
                  include: {
                    produtos: { select: { nome: true, unidade: true } },
                  },
                },
                ordem_producao_consumo_planejado: {
                  include: {
                    produtos: { select: { nome: true, unidade: true } },
                  },
                },
                necessidade_producao: true,
                reserva_estoque: true,
                ordem_producao_fluxo_setor: { orderBy: { ordem: "asc" } },
              },
            })
            if (!ordem) throw new NotFoundError("OP não encontrada.")
            return textoJson(ordem)
          }
          if (op === "detalhe") {
            const reserva = await tx.reserva_estoque.findFirst({
              where: { id, id_empresa: ctx.idEmpresa },
              include: {
                produtos: { select: { nome: true, unidade: true } },
                usuarios: { select: { nome: true } },
                locais_estoque: true,
                produto_variacoes: { include: { cores: true, tamanhos: true } },
                pedido_cliente_item: { select: { id_pedido_cliente: true } },
              },
            })
            if (!reserva) throw new NotFoundError("Reserva não encontrada.")
            const pag = validate(
              z.strictObject({
                pagina: z.coerce.number().int().min(1).max(1000000).default(1),
              }),
              readQuery(request),
            )
            const where = {
              id_empresa: ctx.idEmpresa,
              tabela: "reserva_estoque",
              id_registro: reserva.id,
            }
            const [historico, total] = await Promise.all([
              tx.auditoria.findMany({
                where,
                orderBy: { id: "desc" },
                skip: (pag.pagina - 1) * 25,
                take: 25,
                select: {
                  id: true,
                  data_evento: true,
                  usuarios: { select: { nome: true } },
                  id_usuario: true,
                  dados_novos: true,
                },
              }),
              tx.auditoria.count({ where }),
            ])
            return textoJson({
              reserva,
              restante: restante(reserva).toFixed(3),
              historico,
              total,
              pagina: pag.pagina,
            })
          }
          const filtro = validate(schemas.listarSchema, readQuery(request))
          if (op === "transferencias") {
            const where = { id_empresa: ctx.idEmpresa }
            const [dados, total] = await Promise.all([
              tx.transferencia_estoque.findMany({
                where,
                orderBy: { id: "desc" },
                skip: (filtro.pagina - 1) * filtro.limite,
                take: filtro.limite,
              }),
              tx.transferencia_estoque.count({ where }),
            ])
            return textoJson({
              dados,
              total,
              pagina: filtro.pagina,
              totalPaginas: Math.ceil(total / filtro.limite),
            })
          }
          const where: Prisma.reserva_estoqueWhereInput = {
            id_empresa: ctx.idEmpresa,
            ...(filtro.status ? { status: filtro.status } : {}),
            ...(filtro.origem
              ? {
                  tipo_origem:
                    filtro.origem === "PEDIDO" ? "VENDA" : "ORDEM_PRODUCAO",
                }
              : {}),
            ...(filtro.busca
              ? { produtos: { nome: { contains: filtro.busca } } }
              : {}),
          }
          const [dados, total] = await Promise.all([
            tx.reserva_estoque.findMany({
              where,
              orderBy: { id: "desc" },
              skip: (filtro.pagina - 1) * filtro.limite,
              take: filtro.limite,
              include: {
                produtos: { select: { nome: true, unidade: true } },
                usuarios: { select: { nome: true } },
                locais_estoque: { select: { nome: true } },
                produto_variacoes: {
                  include: {
                    cores: { select: { nome: true } },
                    tamanhos: { select: { nome: true } },
                  },
                },
                pedido_cliente_item: { select: { id_pedido_cliente: true } },
              },
            }),
            tx.reserva_estoque.count({ where }),
          ])
          return textoJson({
            dados: dados.map((r) => ({
              ...r,
              restante: restante(r).toFixed(3),
            })),
            total,
            pagina: filtro.pagina,
            totalPaginas: Math.ceil(total / filtro.limite),
          })
        },
        { isolationLevel: "RepeatableRead" },
      )
      return Response.json({ success: true, data }, { headers })
    }
    if (new URL(request.url).search)
      throw new ValidationError("A escrita não aceita filtros.")
    const chave = validate(
      chaveRecebimento,
      request.headers.get("Idempotency-Key"),
    )
    const contratos: Partial<Record<Operacao, z.ZodType>> = {
      reservas: schemas.reservaSchema,
      liberar: schemas.liberarSchema,
      confirmar: z.strictObject({
        reservas: z.array(schemas.reservaSchema).max(200).default([]),
      }),
      entregar: schemas.entregaSchema,
      consumir: schemas.consumoSchema,
      transferir: schemas.transferenciaSchema,
      receberTransferencia: z.strictObject({}),
    }
    const contrato = contratos[op]
    if (!contrato) throw new ValidationError("Operação indisponível.")
    const body = validate(contrato, await lerJson(request))
    if (op === "reservas") {
      const r = validate(schemas.reservaSchema, body)
      const auth = await requireRole(
        request,
        r.origem === "PEDIDO"
          ? ["ADMINISTRACAO", "VENDAS"]
          : ["ADMINISTRACAO", "PRODUCAO"],
      )
      if (auth.error)
        throw new HttpError(
          auth.error.status,
          "Perfil sem acesso à operação do documento de origem.",
        )
      exigencias.push([
        r.origem === "PEDIDO" ? "PEDIDOS" : "ORDENS_PRODUCAO",
        "editar",
      ])
    }
    const data = await executar(
      ctx,
      chave,
      `${op}:${id ?? ""}`,
      body,
      exigencias,
      async (tx) => {
        if (op === "reservas")
          return reservar(tx, ctx, validate(schemas.reservaSchema, body))
        if (op === "liberar") {
          const input = validate(schemas.liberarSchema, body)
          const r = await tx.reserva_estoque.findFirst({
            where: { id, id_empresa: ctx.idEmpresa },
          })
          if (!r) throw new NotFoundError("Reserva não encontrada.")
          const auth = await requireRole(
            request,
            r.tipo_origem === "VENDA"
              ? ["ADMINISTRACAO", "VENDAS"]
              : ["ADMINISTRACAO", "PRODUCAO"],
          )
          if (auth.error)
            throw new HttpError(
              auth.error.status,
              "Perfil sem acesso ao documento de origem.",
            )
          await conferir(tx, ctx, [
            [
              r.tipo_origem === "VENDA" ? "PEDIDOS" : "ORDENS_PRODUCAO",
              "editar",
            ],
          ])
          await finalizarReserva(
            tx,
            ctx,
            r.id,
            new Prisma.Decimal(input.quantidade),
            false,
            input.motivo,
          )
          return {
            idReserva: r.id,
            quantidadeLiberada: new Prisma.Decimal(input.quantidade).toFixed(3),
          }
        }
        if (op === "confirmar") {
          const input = validate(
            z.strictObject({
              reservas: z.array(schemas.reservaSchema).max(200).default([]),
            }),
            body,
          )
          const pedido = await tx.pedido_cliente.findFirst({
            where: { id, id_empresa: ctx.idEmpresa },
            include: { pedido_cliente_item: true },
          })
          if (
            !pedido ||
            pedido.status !== "RASCUNHO" ||
            !pedido.pedido_cliente_item.length
          )
            throw new ConflictError(
              "Confirmação exige pedido em rascunho com itens.",
            )
          if (pedido.pedido_cliente_item.some((i) => i.quantidade.lte(0)))
            throw new ConflictError("Há item sem quantidade válida.")
          await tx.pedido_cliente.update({
            where: { id: pedido.id },
            data: {
              status: "CONFIRMADO",
              data_confirmacao: new Date(),
              versao: { increment: 1 },
            },
          })
          for (const r of input.reservas) {
            if (r.origem !== "PEDIDO" || r.idOrigem !== pedido.id)
              throw new ValidationError(
                "A reserva deve pertencer ao pedido confirmado.",
              )
            await reservar(tx, ctx, r)
          }
          await auditar(
            tx,
            ctx,
            "pedido_cliente",
            pedido.id,
            { status: pedido.status },
            {
              status: "CONFIRMADO",
              reservas: input.reservas.length,
              atendimento:
                "Consultar quantidades reservadas e pendentes de cada item; confirmação não garante saldo total.",
            },
          )
          return {
            idPedido: pedido.id,
            status: "CONFIRMADO",
            reservasCriadas: input.reservas.length,
            consultarPendencias: true,
          }
        }
        if (op === "entregar")
          return confirmarEntrega(
            tx,
            ctx,
            id!,
            validate(schemas.entregaSchema, body),
            chave,
          )
        if (op === "consumir")
          return consumirMaterial(
            tx,
            ctx,
            id!,
            validate(schemas.consumoSchema, body),
            chave,
          )
        if (op === "transferir")
          return enviarTransferencia(
            tx,
            ctx,
            validate(schemas.transferenciaSchema, body),
            chave,
          )
        if (op === "receberTransferencia") {
          validate(z.strictObject({}), body)
          return receberTransferencia(tx, ctx, id!)
        }
        throw new ValidationError("Operação indisponível.")
      },
    )
    return Response.json(
      { success: true, data: data.dados, criado: data.criado },
      { headers, status: data.criado ? 201 : 200 },
    )
  } catch (erro) {
    if (!(erro instanceof HttpError))
      console.error("Falha na API integrada de estoque.")
    return Response.json(
      {
        success: false,
        error:
          erro instanceof HttpError
            ? erro.message
            : "Erro interno do servidor.",
      },
      { headers, status: erro instanceof HttpError ? erro.status : 500 },
    )
  }
}
