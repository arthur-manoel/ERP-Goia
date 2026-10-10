import "server-only"
import { requireRole } from "@/lib/authorize"
import { prisma } from "@/lib/prisma"
import { EstoqueMinimoError } from "./estoque-minimo.error"

type Acao = "ler" | "criar" | "editar"

const perfis = ["ADMINISTRACAO", "PRODUCAO", "VENDAS", "FINANCEIRO"] as const

async function usuarioAutenticado(request: Request) {
  const auth = await requireRole(request, [...perfis])
  if (auth.error) return auth.error
  const idUsuario = Number(auth.user.id)
  if (!Number.isSafeInteger(idUsuario) || idUsuario <= 0)
    throw new EstoqueMinimoError(401, "Não autenticado.")
  return idUsuario
}

function vinculosAtivos(idUsuario: number) {
  return prisma.usuario_empresa.findMany({
    where: {
      id_usuario: idUsuario,
      status: "ATIVO",
      empresas: { status: "ATIVA" },
      usuarios: { status: "ATIVO" },
    },
    include: {
      empresas: { select: { razao_social: true } },
      usuarios: { select: { nome: true, email: true, nivel_acesso: true } },
      permissoes_usuario: { where: { recurso: "ESTOQUE" } },
    },
  })
}

function permissoes(
  vinculo: Awaited<ReturnType<typeof vinculosAtivos>>[number],
) {
  const admin =
    vinculo.nivel_acesso === "EMPRESA" ||
    vinculo.usuarios.nivel_acesso === "ADMIN"
  const permissao = vinculo.permissoes_usuario[0]
  return {
    podeLer: admin || permissao?.pode_ler === true,
    podeCriar: admin || permissao?.pode_criar === true,
    podeEditar: admin || permissao?.pode_editar === true,
  }
}

export async function empresasParaEstoque(request: Request) {
  const idUsuario = await usuarioAutenticado(request)
  if (idUsuario instanceof Response) return idUsuario
  const vinculos = await vinculosAtivos(idUsuario)
  return {
    usuario: vinculos[0]
      ? { nome: vinculos[0].usuarios.nome, email: vinculos[0].usuarios.email }
      : null,
    empresas: vinculos
      .filter((vinculo) => permissoes(vinculo).podeLer)
      .map((vinculo) => ({
        id: vinculo.id_empresa,
        nome: vinculo.empresas.razao_social,
      })),
  }
}

export async function autorizarEstoque(request: Request, acao: Acao) {
  const idUsuario = await usuarioAutenticado(request)
  if (idUsuario instanceof Response) return idUsuario
  const vinculos = await vinculosAtivos(idUsuario)
  const header = request.headers.get("X-Empresa-Id")
  const vinculo =
    header !== null
      ? vinculos.find(
          (item) =>
            /^[1-9]\d*$/.test(header) && item.id_empresa === Number(header),
        )
      : vinculos.length === 1
        ? vinculos[0]
        : undefined

  if (!vinculo) {
    if (header === null && vinculos.length > 1)
      throw new EstoqueMinimoError(
        400,
        "Informe X-Empresa-Id para selecionar a empresa.",
      )
    throw new EstoqueMinimoError(403, "Acesso negado à empresa.")
  }
  const { podeLer, podeCriar, podeEditar } = permissoes(vinculo)
  const permitido = { ler: podeLer, criar: podeCriar, editar: podeEditar }
  if (!Object.hasOwn(permitido, acao) || permitido[acao] !== true)
    throw new EstoqueMinimoError(403, "Acesso negado ao estoque.")
  return { idUsuario, idEmpresa: vinculo.id_empresa, podeEditar }
}
