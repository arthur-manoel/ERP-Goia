import "server-only"

/**
 * Dados MOCK da Dashboard: valores fictícios, só para desenvolver a tela.
 *
 * Só liga quando as DUAS condições são verdadeiras:
 *  - NODE_ENV !== "production"
 *  - DASHBOARD_DADOS_MOCK=true no .env.local
 *
 * Em produção esta função sempre devolve false, mesmo que a variável esteja definida.
 * Quando ligado, a tela exibe o aviso "Dados de demonstração".
 */
export function usarDadosMock() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.DASHBOARD_DADOS_MOCK === "true"
  )
}
