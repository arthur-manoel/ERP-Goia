import "server-only"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import {
  ConflitoTransitorio,
  HttpError,
  ValidationError,
} from "@/lib/api/errors"
import { readQuery, validate } from "@/lib/api/http"
import { enforceRateLimit } from "@/lib/api/rate-limit"
import { disputaPersistencia } from "@/lib/prisma-concorrencia"
import { lerJson } from "@/modules/movimentacoes-estoque/router"
import {
  autorizar,
  executar,
  auditar,
  type Contexto,
  type Tx,
} from "@/modules/reservas/operacoes"
import { chaveRecebimento } from "@/modules/recebimentos/recebimentos.schema"
import { PedidoError } from "@/modules/pedidos/pedidos.error"
import { acesso, exigir, podeConsultar } from "./cancelamentos.authorization"
import * as schemas from "./cancelamentos.schema"
import * as service from "./cancelamentos.service"
import * as efeitos from "./cancelamentos.execucao"
import * as notificacoes from "@/modules/notificacoes/notificacoes.service"
export type Operacao =
  | "lista"
  | "pedido"
  | "previa"
  | "detalhe"
  | "decisao"
  | "executar"
  | "reavaliar"
  | "devolucoes"
  | "destinacoes"
  | "reembolsos"
  | "notificacoes"
  | "lerNotificacao"
  | "processarNotificacoes"
  | "cargos"
  | "cargo"
const headers = { "Cache-Control": "private, no-store" }
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue
async function verificar(tx: Tx, ctx: Contexto, op: Operacao, id?: number) {
  const a = await acesso(tx, ctx)
  if (op === "cargo" || op === "cargos")
    return exigir(
      a.administrador,
      "Somente proprietário ou administrador pode habilitar cargos para aprovação.",
    )
  if (op === "decisao") return exigir(a.gerente)
  if (op === "devolucoes") return exigir(a.editarEstoque)
  if (op === "destinacoes") return exigir(a.editarEstoque && a.gerente)
  if (op === "reembolsos") return exigir(a.editarFinanceiro)
  if (op === "reavaliar") return exigir(a.solicitar || a.gerente)
  if (op === "pedido") return exigir(a.solicitar)
  if (op === "executar") {
    exigir(a.solicitar)
    const row = await efeitos.buscar(tx, ctx, id!)
    const p = row.plano_efeitos as Record<string, Prisma.JsonValue>
    if (typeof p.credito === "string" && new Prisma.Decimal(p.credito).gt(0))
      exigir(a.cancelarFinanceiro)
    if (
      (Array.isArray(p.reservas) && p.reservas.length) ||
      (Array.isArray(p.devolucoes) && p.devolucoes.length)
    )
      exigir(a.editarEstoque)
    return
  }
  exigir(podeConsultar(a))
}
export async function cancelamentosHandler(
  request: Request,
  op: Operacao,
  rawId?: string,
) {
  let ctx: Contexto | undefined
  let id: number | undefined
  let iniciouExecucao = false
  try {
    const autorizado = await autorizar(request, [])
    if (autorizado instanceof Response) {
      autorizado.headers.set("Cache-Control", "private, no-store")
      return autorizado
    }
    ctx = autorizado
    const escrita = request.method !== "GET"
    enforceRateLimit(
      request,
      {
        scope: `cancelamentos:${op}:${escrita ? "write" : "read"}`,
        windowMs: 60000,
        limit: escrita ? 60 : 120,
      },
      String(ctx.idUsuario),
    )
    if (rawId !== undefined)
      id = validate(
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
          if (op === "previa")
            return service.previa(
              tx,
              ctx!,
              id!,
              validate(schemas.previaSchema, readQuery(request)),
            )
          if (op === "detalhe") {
            validate(z.strictObject({}), readQuery(request))
            return service.detalhe(tx, ctx!, id!)
          }
          if (op === "cargos") {
            await verificar(tx, ctx!, op)
            validate(z.strictObject({}), readQuery(request))
            return tx.cargos.findMany({
              where: { id_empresa: ctx!.idEmpresa },
              select: {
                id: true,
                nome: true,
                status: true,
                aprova_cancelamento: true,
              },
              orderBy: { nome: "asc" },
            })
          }
          const p = validate(schemas.paginaSchema, readQuery(request))
          if (op === "notificacoes")
            return notificacoes.consultar(tx, ctx!, p.pagina, p.limite)
          const lista = await service.listar(
            tx,
            ctx!,
            p.pagina,
            p.limite,
            op === "pedido" ? id : undefined,
          )
          if (op === "pedido")
            return {
              ...lista,
              pedido: await tx.pedido_cliente.findFirst({
                where: { id, id_empresa: ctx!.idEmpresa },
                select: {
                  id: true,
                  numero: true,
                  status: true,
                  pedido_cliente_entrega: {
                    select: { id: true, numero_entrega: true, status: true },
                    orderBy: { id: "asc" },
                  },
                },
              }),
            }
          return lista
        },
        { isolationLevel: "RepeatableRead", timeout: 60000 },
      )
      return Response.json({ success: true, data }, { headers })
    }
    if (new URL(request.url).search)
      throw new ValidationError("Não informe filtros na escrita.")
    const chave = validate(
      chaveRecebimento,
      request.headers.get("Idempotency-Key"),
    )
    const body = await lerJson(request)
    let input: unknown
    switch (op) {
      case "pedido":
        input = validate(schemas.solicitarSchema, body)
        break
      case "decisao":
        input = validate(schemas.decisaoSchema, body)
        break
      case "reavaliar":
        input = validate(schemas.reavaliarSchema, body)
        break
      case "devolucoes":
        input = validate(schemas.devolucaoSchema, body)
        break
      case "destinacoes":
        input = validate(schemas.destinacaoSchema, body)
        break
      case "reembolsos":
        input = validate(schemas.reembolsoSchema, body)
        input = {
          ...(input as z.infer<typeof schemas.reembolsoSchema>),
          valor: new Prisma.Decimal(
            (input as z.infer<typeof schemas.reembolsoSchema>).valor,
          ).toFixed(2),
        }
        break
      case "cargo":
        input = validate(
          z.strictObject({ aprovaCancelamento: z.boolean() }),
          body,
        )
        break
      default:
        input = validate(schemas.vazioSchema, body)
    }
    const result = await executar(
      ctx,
      chave,
      `CANCELAMENTO_${op}`,
      { id, input },
      [],
      async (tx) => {
        switch (op) {
          case "pedido":
            return json(
              await service.solicitar(
                tx,
                ctx!,
                id!,
                input as schemas.Solicitar,
              ),
            )
          case "decisao": {
            const i = input as z.infer<typeof schemas.decisaoSchema>
            return json(
              await service.decidir(tx, ctx!, id!, i.decisao, i.motivo),
            )
          }
          case "reavaliar": {
            const i = input as z.infer<typeof schemas.reavaliarSchema>
            return json(
              await service.reavaliar(tx, ctx!, id!, i.hashEstado, i.motivo),
            )
          }
          case "executar":
            iniciouExecucao = true
            return json(await efeitos.executarEstorno(tx, ctx!, id!))
          case "devolucoes":
            return json(
              await efeitos.receberDevolucao(
                tx,
                ctx!,
                id!,
                input as z.infer<typeof schemas.devolucaoSchema>,
              ),
            )
          case "destinacoes":
            return json(
              await efeitos.destinarAvaria(
                tx,
                ctx!,
                id!,
                input as z.infer<typeof schemas.destinacaoSchema>,
              ),
            )
          case "reembolsos":
            return json(
              await efeitos.reembolsar(
                tx,
                ctx!,
                id!,
                input as z.infer<typeof schemas.reembolsoSchema>,
              ),
            )
          case "lerNotificacao":
            return notificacoes.marcarLida(tx, ctx!, id!)
          case "processarNotificacoes":
            return { solicitado: true }
          case "cargo": {
            const antes = await tx.cargos.findFirst({
              where: { id, id_empresa: ctx!.idEmpresa, status: "ATIVO" },
            })
            if (!antes)
              throw new HttpError(
                404,
                "Cargo ativo não encontrado nesta empresa.",
              )
            const depois = await tx.cargos.update({
              where: { id },
              data: {
                aprova_cancelamento: (input as { aprovaCancelamento: boolean })
                  .aprovaCancelamento,
              },
            })
            await auditar(tx, ctx!, "cargos", id!, antes, depois)
            return { id: id!, aprovaCancelamento: depois.aprova_cancelamento }
          }
          default:
            throw new ValidationError("Operação indisponível.")
        }
      },
      { validar: (tx) => verificar(tx, ctx!, op, id), timeout: 60000 },
    )
    const notificacao = await notificacoes.distribuir(ctx)
    return Response.json(
      {
        success: true,
        data: result.dados,
        criado: result.criado,
        notificacoes: notificacao,
      },
      { status: result.criado ? 201 : 200, headers },
    )
  } catch (erro) {
    const conhecido = erro instanceof HttpError || erro instanceof PedidoError
    const conflito =
      disputaPersistencia(erro) ||
      (erro instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2003", "P2025"].includes(erro.code))
    if (
      iniciouExecucao &&
      ctx &&
      id &&
      (erro instanceof efeitos.ReavaliacaoNecessaria ||
        (!conhecido && !conflito))
    ) {
      try {
        await prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${ctx!.idEmpresa} FOR UPDATE`
            await service.registrarIntervencao(tx, ctx!, id!)
          },
          { timeout: 20000 },
        )
        await notificacoes.distribuir(ctx)
      } catch {}
    }
    if (
      ctx &&
      id &&
      ["devolucoes", "destinacoes", "reembolsos"].includes(op) &&
      !(erro instanceof HttpError) &&
      !(erro instanceof PedidoError) &&
      !disputaPersistencia(erro)
    ) {
      try {
        await prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${ctx!.idEmpresa} FOR UPDATE`
            await service.registrarFalhaEtapa(
              tx,
              ctx!,
              id!,
              op,
              request.headers.get("Idempotency-Key") ?? "tentativa",
            )
          },
          { timeout: 20000 },
        )
        await notificacoes.distribuir(ctx)
      } catch {}
    }
    if (!conhecido && !conflito)
      console.error(
        "Falha na operação de cancelamento; transação não confirmada.",
      )
    return Response.json(
      {
        success: false,
        ...(erro instanceof ConflitoTransitorio
          ? { code: erro.code }
          : !conhecido && conflito
            ? { code: "CONFLITO_TRANSITORIO" }
            : {}),
        error: conhecido
          ? erro.message
          : conflito
            ? "Dados alterados por outra operação. Atualize a consulta e repita com a mesma chave."
            : "Operação não confirmada. Consulte o histórico e repita a mesma tentativa.",
      },
      { status: conhecido ? erro.status : conflito ? 409 : 500, headers },
    )
  }
}
