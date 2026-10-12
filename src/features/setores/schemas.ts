import { z } from "zod"
import { texto, textoOpcional } from "@/features/erp/validacao"
import { LIMITES } from "@/lib/validacao/texto"

/** Setor = local/etapa onde uma atividade de produção acontece. */
export const setorSchema = z.object({
  name: texto("Nome", 2, LIMITES.nomeSetor),
  type: textoOpcional(LIMITES.tipoSetor, "Outro"),
  description: textoOpcional(LIMITES.descricaoCurta),
  status: z.enum(["Ativo", "Inativo"]),
})

export type Setor = z.infer<typeof setorSchema> & { id: string }
