import type { FiltroStatus, FormularioLocal, LocalEstoque } from "./tipos"

export const formularioVazio: FormularioLocal = { nome: "", descricao: "" }

export function paraFormulario(local: LocalEstoque): FormularioLocal {
  return { nome: local.nome, descricao: local.descricao ?? "" }
}

/** Corpo do POST. Descrição vazia vira null, que é como a API guarda "sem descrição". */
export function paraPayload(form: FormularioLocal) {
  return {
    nome: form.nome.trim(),
    descricao: form.descricao.trim() || null,
  }
}

/**
 * Corpo do PATCH com apenas o que mudou, para não reenviar campos que o
 * operador não tocou (e não esbarrar em regras de quem editou antes).
 */
export function paraPatch(form: FormularioLocal, original: LocalEstoque) {
  const completo = paraPayload(form)
  const patch: Partial<ReturnType<typeof paraPayload>> = {}
  if (completo.nome !== original.nome.trim()) patch.nome = completo.nome
  if (completo.descricao !== (original.descricao?.trim() || null))
    patch.descricao = completo.descricao
  return patch
}

// Compara sem acento e sem diferença de maiúsculas ("deposito" acha "Depósito").
const normalizar = (valor: string) =>
  valor.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

/**
 * Filtro por status e busca (nome ou descrição). A API só filtra o nome por
 * trecho exato; a busca sem acento é feita aqui, sobre a lista já carregada.
 */
export function filtrarLocais(
  lista: LocalEstoque[],
  busca: string,
  status: FiltroStatus,
) {
  const termo = normalizar(busca.trim())
  return lista
    .filter(
      (local) =>
        status === "todos" ||
        (status === "ativos") === (local.status === "ATIVO"),
    )
    .filter(
      (local) =>
        !termo ||
        normalizar(local.nome).includes(termo) ||
        normalizar(local.descricao ?? "").includes(termo),
    )
    .toSorted((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}
