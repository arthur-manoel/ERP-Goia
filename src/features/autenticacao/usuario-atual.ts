import "server-only"
import type { UsuarioLogado } from "./types"

// Integrar com a sessão validada pelo servidor.
// Nenhum nome, empresa ou permissão deve ser deduzido de dados de desenvolvimento.
export async function obterUsuarioAtual(): Promise<UsuarioLogado | null> {
  return null
}
