import { fluxoSchema } from "./schemas-api"
import type { Fluxo, FormularioFluxo, FiltroStatus, Setor } from "./tipos"

export const formularioVazio: FormularioFluxo = {
  nome: "",
  descricao: "",
  ativo: true,
  setores: [],
}

export function paraFormulario(fluxo: Fluxo): FormularioFluxo {
  return {
    nome: fluxo.nome,
    descricao: fluxo.descricao ?? "",
    ativo: fluxo.ativo,
    // A API já devolve ordenado, mas ordenar aqui não custa e protege a tela.
    setores: fluxo.setores
      .toSorted((a, b) => a.ordem - b.ordem)
      .map((s) => s.id),
  }
}

/** Corpo do POST/PATCH. Descrição vazia vira null, que limpa o campo na API. */
export function paraPayload(form: FormularioFluxo) {
  return {
    nome: form.nome.trim(),
    descricao: form.descricao.trim() || null,
    ativo: form.ativo,
    setores: form.setores,
  }
}

/** Move o item de `de` para `para` sem alterar a lista original. */
export function moverSetor(ids: number[], de: number, para: number) {
  if (
    de === para ||
    de < 0 ||
    para < 0 ||
    de >= ids.length ||
    para >= ids.length
  )
    return ids
  const copia = [...ids]
  const [item] = copia.splice(de, 1)
  copia.splice(para, 0, item)
  return copia
}

/** Setores ativos que ainda não entraram na sequência (opções do seletor). */
export function setoresParaAdicionar(setores: Setor[], selecionados: number[]) {
  const usados = new Set(selecionados)
  return setores
    .filter((setor) => setor.ativo && !usados.has(setor.id))
    .toSorted((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

/**
 * Valida o formulário e devolve o corpo pronto para a API ou uma mensagem em
 * português. `setores` é a lista completa, usada para barrar setores inativos
 * (a API só aceita fluxos com setores ativos).
 */
export function validarFormulario(
  form: FormularioFluxo,
  setores: Setor[],
):
  | { ok: true; payload: ReturnType<typeof paraPayload> }
  | { ok: false; erro: string } {
  const payload = paraPayload(form)
  if (!payload.nome) return { ok: false, erro: "Informe o nome do fluxo." }
  if (payload.nome.length > 100)
    return { ok: false, erro: "O nome deve ter até 100 caracteres." }
  if (payload.descricao && payload.descricao.length > 255)
    return { ok: false, erro: "A descrição deve ter até 255 caracteres." }
  if (payload.setores.length === 0)
    return { ok: false, erro: "Adicione ao menos um setor ao fluxo." }
  if (payload.setores.length > 100)
    return { ok: false, erro: "Um fluxo aceita no máximo 100 setores." }
  if (new Set(payload.setores).size !== payload.setores.length)
    return { ok: false, erro: "Um mesmo setor não pode aparecer duas vezes." }

  const porId = new Map(setores.map((setor) => [setor.id, setor]))
  const inativo = payload.setores
    .map((id) => porId.get(id))
    .find((setor) => !setor || !setor.ativo)
  if (inativo !== undefined || payload.setores.some((id) => !porId.has(id)))
    return {
      ok: false,
      erro: "Há setor inativo ou inexistente na sequência. Remova-o antes de salvar.",
    }

  // Mesmas regras do backend, como rede de segurança.
  const dados = fluxoSchema.safeParse(payload)
  if (!dados.success)
    return {
      ok: false,
      erro: dados.error.issues[0]?.message ?? "Dados inválidos.",
    }
  return { ok: true, payload }
}

const normalizar = (valor: string) =>
  valor.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

/**
 * Filtro por status e busca (nome, descrição ou nome de algum setor do fluxo).
 * A API filtra só por trecho do nome; fazemos aqui, sem acento, sobre a lista
 * já carregada.
 */
export function filtrarFluxos(
  lista: Fluxo[],
  busca: string,
  status: FiltroStatus,
) {
  const termo = normalizar(busca.trim())
  return lista
    .filter(
      (fluxo) => status === "todos" || (status === "ativos") === fluxo.ativo,
    )
    .filter(
      (fluxo) =>
        !termo ||
        normalizar(fluxo.nome).includes(termo) ||
        normalizar(fluxo.descricao ?? "").includes(termo) ||
        fluxo.setores.some((setor) => normalizar(setor.nome).includes(termo)),
    )
    .toSorted((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}
