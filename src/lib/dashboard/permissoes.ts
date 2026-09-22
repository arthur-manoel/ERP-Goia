import "server-only"
import { usarDadosMock } from "./fonte"

/**
 * O usuário da sessão pode ver o saldo financeiro do mês?
 *
 * PENDENTE: ainda não existe código de autorização no projeto (o banco tem as
 * tabelas `permissoes_usuario` e `administradores_gerais`, mas nenhuma consulta
 * sobre elas). Enquanto a issue de permissões não define a regra, esta função
 * NEGA por padrão: é melhor esconder o saldo do que expô-lo sem checagem.
 *
 * Quando o sistema de permissões existir, troque apenas o corpo desta função,
 * consultando a sessão/permissões no servidor. Nunca aceite essa informação
 * vinda do navegador.
 *
 * Esconder o card é só UX. A proteção real está em `obterSaldoDoMes`, que chama
 * esta função de novo antes de tocar nos dados.
 */
export async function podeVerSaldoDoMes(): Promise<boolean> {
  if (usarDadosMock()) return true // somente desenvolvimento
  return false
}
