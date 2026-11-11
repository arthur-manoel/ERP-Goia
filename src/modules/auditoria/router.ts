import "server-only"
import { requireRole } from "@/lib/authorize"
import { prisma } from "@/lib/prisma"
import { HttpError } from "@/lib/api/errors"
import { readQuery } from "@/lib/api/http"
import { administrador } from "@/modules/usuarios/usuarios.repository"
import { filtrosAuditoria, lerSnapshot, periodoAuditoria } from "./schema"

const headers = { "Cache-Control": "no-store" }
export async function listarHandler(request: Request) {
  try {
    const auth = await requireRole(request, [
      "ADMINISTRACAO",
      "PRODUCAO",
      "VENDAS",
      "FINANCEIRO",
    ])
    if (auth.error) {
      auth.error.headers.set("Cache-Control", "no-store")
      return auth.error
    }
    const idUsuario = Number(auth.user.id)
    if (!Number.isSafeInteger(idUsuario) || idUsuario <= 0)
      throw new HttpError(401, "Não autenticado.")
    const empresa = request.headers.get("X-Empresa-Id")
    if (
      !empresa ||
      !/^[1-9]\d*$/.test(empresa) ||
      !Number.isSafeInteger(Number(empresa))
    )
      throw new HttpError(400, "Selecione uma empresa válida.")
    const parsed = filtrosAuditoria.safeParse(readQuery(request))
    if (!parsed.success)
      throw new HttpError(
        400,
        parsed.error.issues[0]?.message ?? "Filtros inválidos.",
      )
    const f = parsed.data
    const data = await prisma.$transaction(
      async (tx) => {
        const vinculo = await tx.usuario_empresa.findFirst({
          where: {
            id_usuario: idUsuario,
            id_empresa: Number(empresa),
            status: "ATIVO",
            empresas: { status: "ATIVA" },
            usuarios: { status: "ATIVO" },
          },
          include: { usuarios: { select: { nivel_acesso: true } } },
        })
        if (!vinculo || !administrador(vinculo))
          throw new HttpError(
            403,
            "Somente administradores da empresa podem consultar a auditoria.",
          )
        const where = {
          id_empresa: Number(empresa),
          ...(f.usuario ? { id_usuario: f.usuario } : {}),
          ...(f.tabela ? { tabela: f.tabela } : {}),
          ...(f.registro ? { id_registro: f.registro } : {}),
          ...(f.acao ? { acao: f.acao } : {}),
          ...(f.inicio || f.fim
            ? { data_evento: periodoAuditoria(f.inicio, f.fim) }
            : {}),
        }
        const [itens, total] = await Promise.all([
          tx.auditoria.findMany({
            where,
            orderBy: [{ data_evento: "desc" }, { id: "desc" }],
            skip: (f.pagina - 1) * 25,
            take: 25,
            include: { usuarios: { select: { nome: true } } },
          }),
          tx.auditoria.count({ where }),
        ])
        return {
          itens: itens.map(
            ({ dados_anteriores, dados_novos, usuarios, ...item }) => ({
              ...item,
              usuario: usuarios?.nome ?? "Sistema / usuário removido",
              antes: lerSnapshot(dados_anteriores),
              depois: lerSnapshot(dados_novos),
            }),
          ),
          total,
          pagina: f.pagina,
          totalPaginas: Math.ceil(total / 25),
        }
      },
      { isolationLevel: "RepeatableRead" },
    )
    return Response.json(data, { headers })
  } catch (error) {
    if (error instanceof HttpError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      )
    console.error("Falha ao consultar auditoria")
    return Response.json(
      { error: "Não foi possível consultar a auditoria." },
      { status: 500, headers },
    )
  }
}
