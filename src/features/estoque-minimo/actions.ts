"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import type { EstadoFormulario } from "@/lib/formulario"
import { autorizarEstoque } from "./autorizacao"
import { EstoqueMinimoError } from "./erros"
import { configurarMinimoLocalSchema } from "./schemas"
import { salvarMinimoLocal } from "./servico"

export async function configurarMinimoLocal(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const resultado = configurarMinimoLocalSchema.safeParse(
    Object.fromEntries(formData),
  )
  if (!resultado.success) {
    return {
      ok: false,
      erros: z.flattenError(resultado.error).fieldErrors,
    }
  }

  try {
    const contexto = await autorizarEstoque("editar")
    await salvarMinimoLocal(contexto, resultado.data)
  } catch (erro) {
    if (erro instanceof EstoqueMinimoError) {
      return { ok: false, erros: { servidor: [erro.message] } }
    }
    throw erro
  }

  revalidatePath("/")
  revalidatePath("/estoque")
  revalidatePath("/estoque/insumos")
  return { ok: true, mensagem: "Estoque mínimo atualizado para este local." }
}
