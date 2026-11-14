import { z } from "zod"
import { salvarFichaSchema } from "../../../modules/fichas-tecnicas/schema"
import { mensagemErro } from "@/features/autenticacao/provedor-autenticacao"

type Requisitar = (url: string, init?: RequestInit) => Promise<Response>
const fichaSchema = z.object({
  id: z.number().int().positive(),
  versao: z.number().int().positive(),
  itens: z.array(
    z.object({
      id_produto_componente: z.number().int().positive(),
      quantidade: z.string(),
    }),
  ),
})
export type Ficha = z.infer<typeof fichaSchema>
export type ItemFicha = Ficha["itens"][number]
const rota = "/api/fichas-tecnicas/ativa"

export class ConflitoFichaError extends Error {}

async function lerFicha(resposta: Response) {
  if (!resposta.ok) {
    const mensagem = await mensagemErro(resposta)
    if (resposta.status === 409) throw new ConflitoFichaError(mensagem)
    throw new Error(mensagem)
  }
  const resultado = z
    .object({ success: z.literal(true), data: fichaSchema.nullable() })
    .safeParse(await resposta.json())
  if (!resultado.success) throw new Error("Resposta da ficha técnica inválida.")
  return resultado.data.data
}

export function consultarFicha(
  requisitar: Requisitar,
  idEmpresa: number,
  idProduto: number,
  signal: AbortSignal,
) {
  return requisitar(`${rota}?id_produto=${idProduto}`, {
    signal,
    headers: { "X-Empresa-Id": String(idEmpresa) },
  }).then(lerFicha)
}

export async function salvarFicha(
  requisitar: Requisitar,
  idEmpresa: number,
  dados: z.input<typeof salvarFichaSchema>,
) {
  const resultado = salvarFichaSchema.safeParse(dados)
  if (!resultado.success)
    throw new Error(
      resultado.error.issues[0]?.message ?? "Confira a composição da ficha.",
    )
  const resposta = await requisitar(rota, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Empresa-Id": String(idEmpresa),
    },
    body: JSON.stringify(resultado.data),
  })
  const ficha = await lerFicha(resposta)
  if (!ficha)
    throw new Error("A API retornou uma ficha vazia após o salvamento.")
  return ficha
}
