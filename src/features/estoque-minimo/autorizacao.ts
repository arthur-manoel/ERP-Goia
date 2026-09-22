import "server-only"
import { prisma } from "@/lib/prisma"
import { getSessao } from "@/lib/sessao"
import { EstoqueMinimoError } from "./erros"
import type { ContextoEstoque } from "./tipos"

type AcaoEstoque = "ler" | "editar"

export async function autorizarEstoque(
  acao: AcaoEstoque,
): Promise<ContextoEstoque & { podeEditar: boolean }> {
  const sessao = await getSessao()
  const vinculo = await prisma.usuario_empresa.findFirst({
    where: {
      id_usuario: sessao.idUsuario,
      id_empresa: sessao.idEmpresa,
      status: "ATIVO",
      empresas: { status: "ATIVA" },
      usuarios: { status: "ATIVO" },
    },
    include: {
      permissoes_usuario: {
        where: { recurso: "ESTOQUE" },
      },
      usuarios: { select: { nivel_acesso: true } },
    },
  })
  if (!vinculo) throw new EstoqueMinimoError(403, "Acesso negado à empresa.")

  const administrador =
    vinculo.nivel_acesso === "EMPRESA" ||
    vinculo.usuarios.nivel_acesso === "ADMIN"
  const permissao = vinculo.permissoes_usuario[0]
  const podeLer = administrador || permissao?.pode_ler === true
  const podeEditar = administrador || permissao?.pode_editar === true

  if (acao === "ler" ? !podeLer : !podeEditar) {
    throw new EstoqueMinimoError(403, "Acesso negado ao estoque.")
  }
  return {
    idUsuario: sessao.idUsuario,
    idEmpresa: sessao.idEmpresa,
    podeEditar,
  }
}
