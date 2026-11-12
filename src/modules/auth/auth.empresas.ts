import "server-only"
import { z } from "zod"
import { requireRole } from "@/lib/authorize"
import { HttpError } from "@/lib/api/errors"
import { handleRequest, readQuery, validate } from "@/lib/api/http"
import { prisma } from "@/lib/prisma"
import type { EmpresasSessao } from "./auth.empresas.types"

export async function empresasHandler(request: Request) {
  const response = await handleRequest<EmpresasSessao>(async () => {
    const auth = await requireRole(request, [
      "ADMINISTRACAO",
      "PRODUCAO",
      "VENDAS",
      "FINANCEIRO",
    ])
    if (auth.error) throw new HttpError(auth.error.status, "Não autenticado.")
    const id = Number(auth.user.id)
    if (!Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647)
      throw new HttpError(401, "Não autenticado.")
    validate(z.object({}).strict(), readQuery(request))
    // A identidade vem do JWT. Não há empresa selecionada ou permissão de módulo
    // nesta descoberta; inclusive ADMIN continua restrito aos próprios vínculos.
    const usuario = await prisma.usuarios.findFirst({
      where: { id, status: "ATIVO" },
      select: {
        id: true,
        nome: true,
        email: true,
        usuario_empresa: {
          where: { status: "ATIVO", empresas: { status: "ATIVA" } },
          select: {
            id_empresa: true,
            empresas: { select: { razao_social: true } },
          },
          orderBy: { id_empresa: "asc" },
        },
      },
    })
    if (!usuario) throw new HttpError(401, "Não autenticado.")
    const empresas = [
      ...new Map(
        usuario.usuario_empresa.map((v) => [
          v.id_empresa,
          { id: v.id_empresa, nome: v.empresas.razao_social },
        ]),
      ).values(),
    ]
    return {
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email },
      empresas,
    }
  })
  response.headers.set("Cache-Control", "private, no-store")
  response.headers.set("Vary", "Authorization")
  return response
}
