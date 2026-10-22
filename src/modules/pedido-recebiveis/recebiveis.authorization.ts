import "server-only"
import { requireRole } from "@/lib/authorize"
import { prisma } from "@/lib/prisma"
import {
  autorizar,
  type Contexto,
} from "@/modules/pedidos/pedidos.authorization"
import { PedidoError } from "@/modules/pedidos/pedidos.error"

// Gerar os títulos é consequência comercial, não uma concessão de acesso financeiro.
export const autorizarFechamento = (request: Request) =>
  autorizar(request, "editar")

export async function autorizarConsulta(
  request: Request,
): Promise<Contexto | Response> {
  const auth = await requireRole(request, ["ADMINISTRACAO", "FINANCEIRO"])
  if (auth.error) return auth.error
  const idUsuario = Number(auth.user.id)
  if (
    !Number.isSafeInteger(idUsuario) ||
    idUsuario <= 0 ||
    idUsuario > 2147483647
  )
    throw new PedidoError(401, "Não autenticado.")
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
  if (!vinculo) {
    if (header === null && vinculos.length > 1)
      throw new PedidoError(
        400,
        "Informe X-Empresa-Id para selecionar a empresa.",
      )
    throw new PedidoError(403, "Acesso negado à empresa.")
  }
  const admin =
    vinculo.usuarios.nivel_acesso === "ADMIN" ||
    vinculo.nivel_acesso === "EMPRESA"
  const podeLer = vinculo.permissoes_usuario.some(
    (p) => p.recurso === "FINANCEIRO" && p.pode_ler,
  )
  if (!admin && !podeLer) throw new PedidoError(403, "Acesso negado.")
  return { idEmpresa: vinculo.id_empresa, idUsuario }
}
