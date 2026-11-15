import { requireRole, type Role } from "@/lib/authorize"
import { prisma } from "@/lib/prisma"
import { handleRequest } from "@/lib/api/http"
import { HttpError } from "@/lib/api/errors"
import {
  obterOrdensProducaoAbertas,
  obterPedidosAEntregar,
  obterSaldoDoMes,
} from "@/lib/dashboard/indicadores"

const indicadores = {
  ordens: {
    recurso: "ORDENS_PRODUCAO",
    roles: ["ADMINISTRACAO", "PRODUCAO"],
    carregar: obterOrdensProducaoAbertas,
  },
  pedidos: {
    recurso: "PEDIDOS",
    roles: ["ADMINISTRACAO", "VENDAS"],
    carregar: obterPedidosAEntregar,
  },
  saldo: {
    recurso: "FINANCEIRO",
    roles: ["ADMINISTRACAO", "FINANCEIRO"],
    carregar: obterSaldoDoMes,
  },
} satisfies Record<
  string,
  {
    recurso: string
    roles: Role[]
    carregar: (idEmpresa: number) => Promise<unknown>
  }
>

export async function GET(
  request: Request,
  context: { params: Promise<{ indicador: string }> },
) {
  return handleRequest(async () => {
    const { indicador } = await context.params
    if (!Object.hasOwn(indicadores, indicador))
      throw new HttpError(404, "Indicador inexistente.")
    const config = indicadores[indicador as keyof typeof indicadores]
    const auth = await requireRole(request, config.roles)
    if (auth.error) throw new HttpError(auth.error.status, "Acesso negado.")
    const idUsuario = Number(auth.user.id)
    if (
      !Number.isSafeInteger(idUsuario) ||
      idUsuario <= 0 ||
      idUsuario > 2147483647
    )
      throw new HttpError(401, "Não autenticado.")
    const vinculos = await prisma.usuario_empresa.findMany({
      where: {
        id_usuario: idUsuario,
        status: "ATIVO",
        usuarios: { status: "ATIVO" },
        empresas: { status: "ATIVA" },
      },
      include: {
        permissoes_usuario: true,
        usuarios: { select: { nivel_acesso: true } },
      },
    })
    const header = request.headers.get("X-Empresa-Id")
    const vinculo =
      header !== null
        ? vinculos.find(
            (v) =>
              /^[1-9]\d{0,9}$/.test(header) &&
              Number(header) <= 2147483647 &&
              v.id_empresa === Number(header),
          )
        : vinculos.length === 1
          ? vinculos[0]
          : undefined
    if (!vinculo)
      throw new HttpError(
        header === null && vinculos.length > 1 ? 400 : 403,
        "Selecione uma empresa autorizada.",
      )
    const admin =
      vinculo.nivel_acesso === "EMPRESA" ||
      vinculo.usuarios.nivel_acesso === "ADMIN"
    if (
      !admin &&
      !vinculo.permissoes_usuario.some(
        (p) => p.recurso === config.recurso && p.pode_ler,
      )
    )
      throw new HttpError(403, "Acesso negado.")
    return config.carregar(vinculo.id_empresa)
  })
}
