export type OrdemParaEdicao = {
  id: number
  status: string
  observacao: string | null
  data_previsao: string | null
  prioridade: string
  ordem_producao_item: { quantidade: string; tamanho: string }[]
}

// Compara decimais sem convertê-los em ponto flutuante.
function quantidadeCanonica(valor: string) {
  const [inteiro, fracao = ""] = valor.split(".")
  return `${inteiro.replace(/^0+(?=\d)/, "")}.${fracao.replace(/0+$/, "")}`
}

export function montarCadastroOp(
  dados: FormData,
  ordem: OrdemParaEdicao | null,
) {
  const observacao = String(dados.get("observacao") ?? "").trim() || null
  const dia = String(dados.get("previsao") ?? "")
  const dataPrevisao = dia ? `${dia}T00:00:00.000Z` : null
  const prioridade = String(dados.get("prioridade"))
  const quantidade = String(dados.get("quantidade"))
  const tamanho = String(dados.get("tamanho")).trim()
  if (!ordem)
    return {
      idProduto: Number(dados.get("produto")),
      quantidade,
      tamanho,
      prioridade,
      observacao,
      dataPrevisao,
    }

  const item = ordem.ordem_producao_item[0]
  return {
    statusEsperado: ordem.status,
    ...(observacao !== ordem.observacao ? { observacao } : {}),
    // A tela edita dias. Uma data inalterada preserva o timestamp completo.
    ...(dia !== (ordem.data_previsao?.slice(0, 10) ?? "")
      ? { dataPrevisao }
      : {}),
    ...(ordem.status === "PLANEJADA"
      ? {
          ...(prioridade !== ordem.prioridade ? { prioridade } : {}),
          ...(ordem.ordem_producao_item.length === 1
            ? {
                ...(quantidadeCanonica(quantidade) !==
                quantidadeCanonica(item.quantidade)
                  ? { quantidade }
                  : {}),
                ...(tamanho !== item.tamanho ? { tamanho } : {}),
              }
            : {}),
        }
      : {}),
  }
}
