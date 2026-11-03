const recusasDefinitivas = [400, 403, 404, 409, 413, 415, 422]

// Uma recusa confirmada encerra a tentativa mesmo quando o servidor não envia
// JSON. Uma resposta inconclusiva preserva a chave para repetir com segurança.
export async function lerRespostaOperacao(
  resposta: Response,
  descartarTentativa: () => void,
) {
  if (resposta.ok) return resposta.json()
  if (recusasDefinitivas.includes(resposta.status)) descartarTentativa()
  const dados = await resposta.json().catch(() => null)
  return {
    error:
      typeof dados?.error === "string"
        ? dados.error
        : resposta.status === 403
          ? "Você não tem permissão para esta operação."
          : undefined,
  }
}
