import "server-only"
import { requireRole } from "@/lib/authorize"
import { prisma } from "@/lib/prisma"
import { VendaError } from "./vendas.error"

export type ContextoVenda = {
  idEmpresa: number
  idUsuario: number
  idUsuarioEmpresa: number
}
export type AcaoVenda = "ler" | "criar" | "editar" | "excluir"

export async function autorizarVenda(
  request: Request,
  acao: AcaoVenda,
): Promise<ContextoVenda | Response> {
  const auth = await requireRole(request, ["ADMINISTRACAO", "VENDAS"])
  if (auth.error) return auth.error
  const idUsuario = Number(auth.user.id)
  if (
    !Number.isSafeInteger(idUsuario) ||
    idUsuario <= 0 ||
    idUsuario > 2147483647
  )
    throw new VendaError(401, "Não autenticado.")

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
          (item) =>
            /^[1-9]\d{0,9}$/.test(header) &&
            Number(header) <= 2147483647 &&
            item.id_empresa === Number(header),
        )
      : vinculos.length === 1
        ? vinculos[0]
        : undefined
  if (!vinculo) {
    if (header === null && vinculos.length > 1)
      throw new VendaError(
        400,
        "Informe X-Empresa-Id para selecionar a empresa.",
      )
    throw new VendaError(403, "Acesso negado à empresa.")
  }

  const admin =
    vinculo.usuarios.nivel_acesso === "ADMIN" ||
    vinculo.nivel_acesso === "EMPRESA"
  const permissao = vinculo.permissoes_usuario.find(
    (item) => item.recurso === "VENDAS",
  )
  const regras = {
    ler: Boolean(permissao?.pode_ler),
    criar: Boolean(permissao?.pode_criar),
    editar: Boolean(permissao?.pode_editar),
    excluir: Boolean(permissao?.pode_editar && permissao.pode_excluir),
  }
  if (!admin && !regras[acao]) throw new VendaError(403, "Acesso negado.")
  return {
    idEmpresa: vinculo.id_empresa,
    idUsuario,
    idUsuarioEmpresa: vinculo.id,
  }
}
