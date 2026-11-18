import { z } from "zod"
import { mensagemErro } from "@/features/autenticacao/provedor-autenticacao"
import {
  criarFonteServidor,
  normalizarPaginacao,
  RespostaInvalidaError,
} from "@/lib/listagem/contratos"
import type { FonteListagem } from "@/lib/listagem/tipos"
import {
  cabecalhosEmpresa,
  metaSetoresSchema,
  setorSchemaApi,
  type Requisitar,
} from "./api"
import type { MetaSetores, SetorApi } from "./tipos"

/** Nomes aceitos por GET /api/setores (o schema do servidor rejeita parâmetros extras). */
const nomes = { pagina: "pagina", limite: "limite", busca: "nome" }

export function normalizarSetores(corpo: unknown) {
  const base = normalizarPaginacao<unknown, unknown>(corpo, "setores")
  const itens = z.array(setorSchemaApi).safeParse(base.itens)
  const meta = metaSetoresSchema.safeParse(base.meta)
  if (!itens.success || !meta.success)
    throw new RespostaInvalidaError("setores inválidos")
  return { ...base, itens: itens.data, meta: meta.data }
}

/**
 * A fonte é presa a uma empresa: cada requisição leva o seu X-Empresa-Id e
 * `requisitar` recusa se a empresa ativa já for outra, então uma resposta da
 * empresa anterior nunca entra na lista da atual.
 */
export function criarFonteSetores(
  requisitar: Requisitar,
  idEmpresa: number,
): FonteListagem<SetorApi, MetaSetores> {
  return criarFonteServidor<SetorApi, MetaSetores>({
    rota: "/api/setores",
    nomes,
    obter: async (url, sinal) => {
      const resposta = await requisitar(url, {
        signal: sinal,
        headers: cabecalhosEmpresa(idEmpresa),
      })
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      try {
        return (await resposta.json()) as unknown
      } catch {
        throw new RespostaInvalidaError("JSON inválido")
      }
    },
    normalizar: normalizarSetores,
  })
}
