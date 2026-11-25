import "server-only"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { requireRole } from "@/lib/authorize"
import {
  HttpError,
  NotFoundError,
  ConflictError,
  ConflitoTransitorio,
  ValidationError,
} from "@/lib/api/errors"
import { readQuery, validate } from "@/lib/api/http"
import { enforceRateLimit } from "@/lib/api/rate-limit"
import { lerJson } from "@/modules/movimentacoes-estoque/router"
import { chaveRecebimento } from "@/modules/recebimentos/recebimentos.schema"
import { perdasIntegraisComprovadas } from "@/modules/producao/ordem.validation"
import { variacaoAtivaNaEmpresa } from "@/modules/estoque/estoque.grade"
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

import { listarTransferencias } from "./transferencias.consulta"

class OperacaoRecusada extends HttpError {
  constructor(
    status: number,
    mensagem: string,
    readonly code: string,
  ) {
    super(status, mensagem)
  }
}

class RecuperacaoIndisponivel extends HttpError {
  readonly code = "RECUPERACAO_INDISPONIVEL"

  constructor() {
    super(
      404,
      "Tentativa antiga sem resultado recuperável para esta conta. Confira o histórico antes de iniciar outra transferência.",
    )
  }
}

type Operacao =
  | "disponibilidade"
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
    if (
      [
        "pedido",
        "confirmar",
        "entregar",
        "fechamento",
        "disponibilidade",
      ].includes(op)
    )
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
          if (op === "disponibilidade") {
            const filtro = validate(
              z.strictObject({
                idProduto: z.coerce.number().pipe(schemas.id),
                idVariacao: z.coerce.number().pipe(schemas.id).optional(),
              }),
              readQuery(request),
            )
            const produto = await tx.produtos.findFirst({
              where: {
                id: filtro.idProduto,
                status: "ATIVO",
                controla_estoque: true,
                produto_empresa: {
                  some: { id_empresa: ctx.idEmpresa, status: "ATIVO" },
                },
              },
              select: { id: true },
            })
            if (!produto)
              throw new NotFoundError(
                "Produto ativo não encontrado na empresa.",
              )
            if (
              filtro.idVariacao &&
              !(await tx.produto_variacoes.findFirst({
                where: {
                  id: filtro.idVariacao,
                  id_produto: produto.id,
                  id_empresa: ctx.idEmpresa,
                  status: "ATIVO",
                },
                select: { id: true },
              }))
            )
              throw new NotFoundError(
                "Variação ativa não encontrada no produto.",
              )
            const posicoes = await tx.estoque.findMany({
              where: {
                id_empresa: ctx.idEmpresa,
                id_produto: produto.id,
                locais_estoque: { id_empresa: ctx.idEmpresa, status: "ATIVO" },
                setores: { id_empresa: ctx.idEmpresa, status: "ATIVO" },
              },
              include: { estoque_variacao: true },
            })
            let fisica = new Prisma.Decimal(0)
            let reservada = new Prisma.Decimal(0)
            for (const p of posicoes) {
              const fisicaGrade = p.estoque_variacao.reduce(
                (s, v) => s.plus(v.quantidade),
                new Prisma.Decimal(0),
              )
              const reservadaGrade = p.estoque_variacao.reduce(
                (s, v) => s.plus(v.quantidade_reservada),
                new Prisma.Decimal(0),
              )
              if (
                p.quantidade.lt(0) ||
                p.quantidade_reservada.lt(0) ||
                p.quantidade_reservada.gt(p.quantidade) ||
                fisicaGrade.gt(p.quantidade) ||
                reservadaGrade.gt(p.quantidade_reservada) ||
                p.estoque_variacao.some(
                  (v) =>
                    v.quantidade.lt(0) ||
                    v.quantidade_reservada.lt(0) ||
                    v.quantidade_reservada.gt(v.quantidade),
                )
              )
                throw new ConflictError("Saldo de estoque exige regularização.")
              const grade = p.estoque_variacao.find(
                (v) => v.id_variacao === filtro.idVariacao,
              )
              const q = filtro.idVariacao
                ? (grade?.quantidade ?? new Prisma.Decimal(0))
                : p.quantidade.minus(
                    p.estoque_variacao.reduce(
                      (s, v) => s.plus(v.quantidade),
                      new Prisma.Decimal(0),
                    ),
                  )
              const r = filtro.idVariacao
                ? (grade?.quantidade_reservada ?? new Prisma.Decimal(0))
                : p.quantidade_reservada.minus(
                    p.estoque_variacao.reduce(
                      (s, v) => s.plus(v.quantidade_reservada),
                      new Prisma.Decimal(0),
                    ),
                  )
              if (q.lt(0) || r.lt(0) || r.gt(q))
                throw new ConflictError("Saldo de estoque exige regularização.")
              fisica = fisica.plus(q)
              reservada = reservada.plus(r)
            }
            return {
              fisica: fisica.toFixed(3),
              reservada: reservada.toFixed(3),
              disponivel: fisica.minus(reservada).toFixed(3),
            }
          }
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
                  permite_producao: true,
                  _count: {
                    select: {
                      produto_variacoes: {
                        where: { id_empresa: ctx.idEmpresa },
                      },
                    },
                  },
                  produto_variacoes: {
                    where: { id_empresa: ctx.idEmpresa, status: "ATIVO" },
                    select: {
                      id: true,
                      cores: {
                        select: { nome: true, status: true, id_empresa: true },
                      },
                      tamanhos: {
                        select: { nome: true, status: true, id_empresa: true },
                      },
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
            return textoJson({
              produtos: produtos.map(
                ({ _count, produto_variacoes, ...produto }) => ({
                  produto_variacoes: produto_variacoes
                    .filter((variacao) =>
                      variacaoAtivaNaEmpresa(variacao, ctx.idEmpresa),
                    )
                    .map(({ id, cores, tamanhos }) => ({
                      id,
                      cores: cores ? { nome: cores.nome } : null,
                      tamanhos: tamanhos ? { nome: tamanhos.nome } : null,
                    })),
                  ...produto,
                  possui_grade: _count.produto_variacoes > 0,
                }),
              ),
              locais,
              setores,
              limiteProdutos: 50,
            })
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
                id_cliente: true,
                id_endereco_entrega: true,
                destinatario: true,
                telefone_entrega: true,
                endereco_entrega: true,
                numero_entrega: true,
                complemento_entrega: true,
                bairro_entrega: true,
                cidade_entrega: true,
                estado_entrega: true,
                cep_entrega: true,
                referencia_entrega: true,
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
            const contatosCliente = await tx.cliente_contato.findMany({
              where: {
                id_cliente: pedido.id_cliente,
                ativo: true,
                clientes: { id_empresa: ctx.idEmpresa },
              },
              select: {
                tipo: true,
                valor: true,
                descricao: true,
                principal: true,
              },
              orderBy: [{ principal: "desc" }, { id: "asc" }],
            })
            return textoJson({ ...pedido, contatosCliente })
          }
          if (op === "producao") {
            if (new URL(request.url).search)
              throw new ValidationError("Não informe filtros no detalhe.")
            const ordem = await tx.ordem_producao.findFirst({
              where: { id, id_empresa: ctx.idEmpresa },
              include: {
                ordem_producao_item: {
                  include: {
                    produtos: {
                      select: {
                        nome: true,
                        unidade: true,
                        estoque: {
                          where: { id_empresa: ctx.idEmpresa },
                          select: { id_local_estoque: true, id_setor: true },
                        },
                        produto_variacoes: {
                          where: { id_empresa: ctx.idEmpresa },
                          orderBy: { id: "asc" },
                          select: {
                            id: true,
                            id_cor: true,
                            id_tamanho: true,
                            status: true,
                            cores: {
                              select: {
                                nome: true,
                                status: true,
                                id_empresa: true,
                              },
                            },
                            tamanhos: {
                              select: {
                                nome: true,
                                status: true,
                                id_empresa: true,
                              },
                            },
                          },
                        },
                      },
                    },
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
            const perdas = await perdasIntegraisComprovadas(tx, ordem)
            return textoJson({
              ...ordem,
              ordem_producao_item: ordem.ordem_producao_item.map((item) => ({
                ...item,
                produtos: {
                  ...item.produtos,
                  produto_variacoes: item.produtos.produto_variacoes.map(
                    (v) => ({
                      id: v.id,
                      id_cor: v.id_cor,
                      id_tamanho: v.id_tamanho,
                      status: v.status,
                      elegivel:
                        v.status === "ATIVO" &&
                        variacaoAtivaNaEmpresa(v, ctx.idEmpresa),
                      cores: v.cores && { nome: v.cores.nome },
                      tamanhos: v.tamanhos && { nome: v.tamanhos.nome },
                    }),
                  ),
                },
              })),
              itensComPerdaIntegral: [...perdas],
            })
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
          if (op === "transferencias")
            return textoJson(
              await listarTransferencias(
                tx,
                ctx,
                validate(
                  schemas.listarTransferenciasSchema,
                  readQuery(request),
                ),
              ),
            )
          const filtro = validate(schemas.listarSchema, readQuery(request))
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
      // O corpo vazio só pode recuperar o resultado de uma chave legada já gravada.
      receberTransferencia: z.union([
        schemas.receberTransferenciaSchema,
        z.strictObject({}),
      ]),
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
    const somenteRecuperar =
      (op === "transferir" || op === "receberTransferencia") &&
      request.headers.get("X-Recuperar-Transferencia") === "1"
    const data = await executar(
      ctx,
      chave,
      `${op}:${id ?? ""}`,
      body,
      exigencias,
      async (tx) => {
        // O executor só chama este bloco quando a chave ainda não tem resultado.
        if (somenteRecuperar) throw new RecuperacaoIndisponivel()
        if (op === "reservas")
          return reservar(tx, ctx, validate(schemas.reservaSchema, body))
        if (op === "liberar") {
          const input = validate(schemas.liberarSchema, body)
          await finalizarReserva(
            tx,
            ctx,
            id!,
            new Prisma.Decimal(input.quantidade),
            false,
            input.motivo,
          )
          return {
            idReserva: id!,
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
        if (op === "entregar") {
          try {
            return await confirmarEntrega(
              tx,
              ctx,
              id!,
              validate(schemas.entregaSchema, body),
              chave,
            )
          } catch (erro) {
            // O callback só roda após a consulta da chave na transação.
            if (
              erro instanceof HttpError &&
              [400, 404, 409].includes(erro.status) &&
              !(erro instanceof ConflitoTransitorio)
            )
              throw new OperacaoRecusada(
                erro.status,
                erro.message,
                "ENTREGA_RECUSADA",
              )
            throw erro
          }
        }
        if (op === "consumir")
          return consumirMaterial(
            tx,
            ctx,
            id!,
            validate(schemas.consumoSchema, body),
            chave,
          )
        if (op === "transferir" || op === "receberTransferencia") {
          try {
            if (op === "transferir")
              return await enviarTransferencia(
                tx,
                ctx,
                validate(schemas.transferenciaSchema, body),
                chave,
              )
            const entrada = validate(schemas.receberTransferenciaSchema, body)
            return await receberTransferencia(tx, ctx, id!, entrada.quantidade)
          } catch (erro) {
            // A recusa é conclusiva porque a chave já foi consultada nesta transação.
            if (
              erro instanceof HttpError &&
              [400, 404, 409].includes(erro.status) &&
              !(erro instanceof ConflitoTransitorio)
            )
              throw new OperacaoRecusada(
                erro.status,
                erro.message,
                "TRANSFERENCIA_RECUSADA",
              )
            throw erro
          }
        }
        throw new ValidationError("Operação indisponível.")
      },
      op === "liberar"
        ? {
            validar: async (tx) => {
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
            },
          }
        : undefined,
    ).catch((erro: unknown) => {
      if (
        somenteRecuperar &&
        erro instanceof ConflictError &&
        !(erro instanceof ConflitoTransitorio)
      )
        throw new RecuperacaoIndisponivel()
      throw erro
    })
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
        ...(erro instanceof ConflitoTransitorio ||
        erro instanceof OperacaoRecusada ||
        erro instanceof RecuperacaoIndisponivel
          ? { code: erro.code }
          : {}),
        error:
          erro instanceof HttpError
            ? erro.message
            : "Erro interno do servidor.",
      },
      { headers, status: erro instanceof HttpError ? erro.status : 500 },
    )
  }
}
