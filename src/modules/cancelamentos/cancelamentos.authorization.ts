import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import { HttpError } from "@/lib/api/errors"
import type { Contexto, Tx, Exigencia } from "@/modules/reservas/operacoes"
export async function acesso(tx: Tx, ctx: Contexto) {
  const link = await tx.usuario_empresa.findFirst({
    where: {
      id_usuario: ctx.idUsuario,
      id_empresa: ctx.idEmpresa,
      status: "ATIVO",
      usuarios: { status: "ATIVO" },
      empresas: { status: "ATIVA" },
    },
    include: { usuarios: true, cargos: true, permissoes_usuario: true },
  })
  if (!link || (link.cargos && link.cargos.status !== "ATIVO"))
    throw new HttpError(403, "Vínculo ou cargo inativo na empresa.")
  return avaliarVinculo(link)
}
export function avaliarVinculo(
  link: Prisma.usuario_empresaGetPayload<{
    include: { usuarios: true; cargos: true; permissoes_usuario: true }
  }>,
) {
  const administrador =
    link.nivel_acesso === "EMPRESA" || link.usuarios.nivel_acesso === "ADMIN"
  const permite = (recurso: Exigencia[0], acao: Exigencia[1]) =>
    administrador ||
    Boolean(
      link.permissoes_usuario.find((p) => p.recurso === recurso)?.[
        `pode_${acao}`
      ],
    )
  const gerente =
    administrador ||
    Boolean(link.cargos?.aprova_cancelamento && permite("PEDIDOS", "ler"))
  return {
    administrador,
    gerente,
    lerPedido: permite("PEDIDOS", "ler"),
    solicitar: permite("PEDIDOS", "ler") && permite("PEDIDOS", "excluir"),
    estoque: permite("ESTOQUE", "ler"),
    editarEstoque: permite("ESTOQUE", "ler") && permite("ESTOQUE", "editar"),
    financeiro: permite("FINANCEIRO", "ler"),
    editarFinanceiro:
      permite("FINANCEIRO", "ler") && permite("FINANCEIRO", "editar"),
    cancelarFinanceiro:
      permite("FINANCEIRO", "ler") &&
      permite("FINANCEIRO", "editar") &&
      permite("FINANCEIRO", "excluir"),
  }
}
export type Acesso = Awaited<ReturnType<typeof acesso>>
export function exigir(
  condicao: boolean,
  mensagem = "Sem permissão para esta etapa na empresa ativa.",
): asserts condicao {
  if (!condicao) throw new HttpError(403, mensagem)
}
export function podeConsultar(a: Acesso) {
  return a.lerPedido || a.gerente || a.estoque || a.financeiro
}
