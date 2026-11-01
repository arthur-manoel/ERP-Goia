import "server-only"
import { createHash } from "node:crypto"
import { Prisma } from "@/generated/prisma/client"
import { requireRole } from "@/lib/authorize"
import { HttpError, ConflictError } from "@/lib/api/errors"
import { prisma } from "@/lib/prisma"
import { disputaPersistencia } from "@/lib/prisma-concorrencia"
export type Tx = Prisma.TransactionClient
export type Contexto = { idEmpresa: number; idUsuario: number }
export type Exigencia = [
  "ESTOQUE" | "PEDIDOS" | "ORDENS_PRODUCAO",
  "ler" | "criar" | "editar" | "excluir",
]
export async function conferir(
  tx: Pick<Tx, "usuario_empresa">,
  ctx: Contexto,
  exigencias: Exigencia[],
) {
  const vinculo = await tx.usuario_empresa.findFirst({
    where: {
      id_empresa: ctx.idEmpresa,
      id_usuario: ctx.idUsuario,
      status: "ATIVO",
      usuarios: { status: "ATIVO" },
      empresas: { status: "ATIVA" },
    },
    include: { usuarios: true, permissoes_usuario: true },
  })
  if (!vinculo)
    throw new HttpError(403, "Vínculo ativo não encontrado na empresa.")
  if (
    vinculo.nivel_acesso === "EMPRESA" ||
    vinculo.usuarios.nivel_acesso === "ADMIN"
  )
    return
  for (const [recurso, acao] of exigencias) {
    const permissao = vinculo.permissoes_usuario.find(
      (p) => p.recurso === recurso,
    )
    if (!permissao?.[`pode_${acao}`])
      throw new HttpError(403, `Sem permissão de ${acao} em ${recurso}.`)
  }
}
export async function autorizar(
  request: Request,
  exigencias: Exigencia[],
): Promise<Contexto | Response> {
  const auth = await requireRole(
    request,
    exigencias.some(([r]) => r === "PEDIDOS")
      ? ["ADMINISTRACAO", "VENDAS"]
      : exigencias.some(([r]) => r === "ORDENS_PRODUCAO")
        ? ["ADMINISTRACAO", "PRODUCAO"]
        : ["ADMINISTRACAO", "PRODUCAO", "VENDAS", "FINANCEIRO"],
  )
  if (auth.error) return auth.error
  const idUsuario = Number(auth.user.id)
  if (
    !Number.isSafeInteger(idUsuario) ||
    idUsuario < 1 ||
    idUsuario > 2147483647
  )
    throw new HttpError(401, "Não autenticado.")
  const links = await prisma.usuario_empresa.findMany({
    where: {
      id_usuario: idUsuario,
      status: "ATIVO",
      empresas: { status: "ATIVA" },
      usuarios: { status: "ATIVO" },
    },
    select: { id_empresa: true },
  })
  const header = request.headers.get("X-Empresa-Id")
  if (header === null && links.length > 1)
    throw new HttpError(400, "Informe X-Empresa-Id.")
  const link =
    header === null
      ? links[0]
      : links.find(
          (v) =>
            /^[1-9]\d{0,9}$/.test(header) && v.id_empresa === Number(header),
        )
  if (!link) throw new HttpError(403, "Acesso negado à empresa.")
  const ctx = { idEmpresa: link.id_empresa, idUsuario }
  await conferir(prisma, ctx, exigencias)
  return ctx
}
export function auditar(
  tx: Tx,
  ctx: Contexto,
  tabela: string,
  id: number,
  antes: unknown,
  depois: unknown,
) {
  return tx.auditoria.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_usuario: ctx.idUsuario,
      tabela,
      id_registro: id,
      acao: antes ? "UPDATE" : "INSERT",
      dados_anteriores: antes ? JSON.stringify(antes) : null,
      dados_novos: JSON.stringify(depois),
    },
  })
}
function canonizar(input: unknown, campo = ""): unknown {
  if (campo === "quantidade" && typeof input === "string")
    return new Prisma.Decimal(input).toFixed(3)
  if (Array.isArray(input)) return input.map((v) => canonizar(v))
  if (input && typeof input === "object")
    return Object.fromEntries(
      Object.entries(input)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonizar(v, k)]),
    )
  return input
}
export function chaveMovimento(prefixo: string, chave: string) {
  return `${prefixo}:${createHash("sha256").update(chave).digest("hex")}`
}
export async function executar<T extends Prisma.InputJsonValue>(
  ctx: Contexto,
  chave: string,
  tipo: string,
  input: unknown,
  exigencias: Exigencia[],
  operacao: (tx: Tx) => Promise<T>,
) {
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        tipo,
        idUsuario: ctx.idUsuario,
        input: canonizar(input),
      }),
    )
    .digest("hex")
  for (let i = 0; i < 3; i++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${ctx.idEmpresa} FOR UPDATE`
          await conferir(tx, ctx, exigencias)
          const anterior = await tx.operacao_erp.findUnique({
            where: { id_empresa_chave: { id_empresa: ctx.idEmpresa, chave } },
          })
          if (anterior) {
            if (
              anterior.hash !== hash ||
              anterior.id_usuario !== ctx.idUsuario ||
              anterior.tipo !== tipo
            )
              throw new ConflictError(
                "Chave já utilizada para outra operação. Repita os mesmos dados com a mesma chave.",
              )
            return { dados: anterior.resultado as T, criado: false }
          }
          const dados = await operacao(tx)
          await tx.operacao_erp.create({
            data: {
              id_empresa: ctx.idEmpresa,
              id_usuario: ctx.idUsuario,
              chave,
              hash,
              tipo,
              resultado: dados,
            },
          })
          return { dados, criado: true }
        },
        { isolationLevel: "Serializable", timeout: 20000, maxWait: 10000 },
      )
    } catch (e) {
      if (!disputaPersistencia(e)) throw e
      if (i === 2)
        throw new ConflictError(
          "Dados alterados por outra operação. Consulte novamente ou repita a mesma chave.",
        )
    }
  }
  throw new ConflictError("Operação não confirmada.")
}
