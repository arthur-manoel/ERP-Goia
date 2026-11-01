import type { FormularioTipoProduto, TipoProduto } from "./tipos"

export const formularioVazio: FormularioTipoProduto = {
  nome: "",
  descricao: "",
}

export function paraFormulario(item: TipoProduto): FormularioTipoProduto {
  return { nome: item.nome, descricao: item.descricao ?? "" }
}

/**
 * Converte o formulário no corpo que a API espera. Descrição vazia vira null,
 * que é como a API limpa o campo.
 */
export function paraPayload(form: FormularioTipoProduto) {
  return {
    nome: form.nome.trim(),
    descricao: form.descricao.trim() || null,
  }
}

// Compara sem acento e sem diferença de maiúsculas ("cafe" acha "Café").
const normalizar = (valor: string) =>
  valor.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

/**
 * Busca por nome ou descrição. A API só filtra o nome por igualdade exata,
 * então a busca "contém" é feita aqui, sobre a lista já carregada.
 */
export function filtrarTiposProduto(lista: TipoProduto[], busca: string) {
  const termo = normalizar(busca.trim())
  if (!termo) return lista
  return lista.filter(
    (item) =>
      normalizar(item.nome).includes(termo) ||
      normalizar(item.descricao ?? "").includes(termo),
  )
}
