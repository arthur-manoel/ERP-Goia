"use client"

import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { useIndicador } from "./provedor-indicadores"

/** Estoque compartilha o contexto e o ciclo de vida dos demais indicadores. */
export function useIndicadorEstoque() {
  const { estado, empresas, empresa } = useAutenticacao()
  const resultado = useIndicador("estoque")
  return {
    estado,
    empresas,
    empresa,
    dados: resultado?.estado === "ok" ? resultado.dados : null,
    falha:
      resultado?.estado === "erro" || resultado?.estado === "nao_integrado",
    semPermissao: resultado?.estado === "sem_permissao",
  }
}
