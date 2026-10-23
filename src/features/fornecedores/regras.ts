import type {
  Fornecedor,
  FormularioFornecedor,
  SituacaoFornecedor,
} from "./tipos"

export const estados = [
  ["AC", "Acre"],
  ["AL", "Alagoas"],
  ["AP", "Amapá"],
  ["AM", "Amazonas"],
  ["BA", "Bahia"],
  ["CE", "Ceará"],
  ["DF", "Distrito Federal"],
  ["ES", "Espírito Santo"],
  ["GO", "Goiás"],
  ["MA", "Maranhão"],
  ["MT", "Mato Grosso"],
  ["MS", "Mato Grosso do Sul"],
  ["MG", "Minas Gerais"],
  ["PA", "Pará"],
  ["PB", "Paraíba"],
  ["PR", "Paraná"],
  ["PE", "Pernambuco"],
  ["PI", "Piauí"],
  ["RJ", "Rio de Janeiro"],
  ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"],
  ["RO", "Rondônia"],
  ["RR", "Roraima"],
  ["SC", "Santa Catarina"],
  ["SP", "São Paulo"],
  ["SE", "Sergipe"],
  ["TO", "Tocantins"],
].map(([sigla, nome]) => ({ value: sigla, label: `${sigla} — ${nome}` }))

export const formularioVazio: FormularioFornecedor = {
  razaoSocial: "",
  nomeFantasia: "",
  cnpj: "",
  inscricaoEstadual: "",
  email: "",
  telefone: "",
  cep: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  status: "ATIVO",
}

/** Remove máscara e espaços e deixa em maiúsculas (forma canônica do CNPJ). */
export function normalizarCnpj(valor: string) {
  return valor.replace(/[./\-\s]/g, "").toUpperCase()
}

/** Exibe com máscara; devolve "—" quando não há CNPJ. */
export function formatarCnpj(valor: string | null) {
  if (!valor) return "—"
  const limpo = normalizarCnpj(valor)
  return limpo.length === 14
    ? limpo.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5")
    : valor
}

// A API rejeita string vazia em CNPJ/e-mail: para limpar um campo, envia null.
const textoOuNulo = (valor: string) => valor.trim() || null

export function paraFormulario(item: Fornecedor): FormularioFornecedor {
  return {
    razaoSocial: item.razao_social,
    nomeFantasia: item.nome_fantasia ?? "",
    cnpj: item.cnpj ? formatarCnpj(item.cnpj) : "",
    inscricaoEstadual: item.inscricao_estadual ?? "",
    email: item.email ?? "",
    telefone: item.telefone ?? "",
    cep: item.cep ?? "",
    endereco: item.endereco ?? "",
    numero: item.numero ?? "",
    complemento: item.complemento ?? "",
    bairro: item.bairro ?? "",
    cidade: item.cidade ?? "",
    estado: item.estado ?? "",
    status: (item.status === "INATIVO"
      ? "INATIVO"
      : "ATIVO") satisfies SituacaoFornecedor,
  }
}

/**
 * Converte o formulário no corpo que a API espera. `idEmpresa` só vai na
 * criação: a troca de empresa de um fornecedor existente não é feita aqui.
 */
export function paraPayload(form: FormularioFornecedor, idEmpresa?: number) {
  return {
    ...(idEmpresa === undefined ? {} : { id_empresa: idEmpresa }),
    razao_social: form.razaoSocial.trim(),
    nome_fantasia: textoOuNulo(form.nomeFantasia),
    cnpj: textoOuNulo(form.cnpj),
    inscricao_estadual: textoOuNulo(form.inscricaoEstadual),
    email: textoOuNulo(form.email),
    telefone: textoOuNulo(form.telefone),
    cep: textoOuNulo(form.cep),
    endereco: textoOuNulo(form.endereco),
    numero: textoOuNulo(form.numero),
    complemento: textoOuNulo(form.complemento),
    bairro: textoOuNulo(form.bairro),
    cidade: textoOuNulo(form.cidade),
    estado: textoOuNulo(form.estado),
    status: form.status,
  }
}

/**
 * Busca por razão social, nome fantasia, e-mail ou CNPJ. O CNPJ é comparado
 * sem máscara dos dois lados: o termo digitado e o valor do registro (que a
 * API pode devolver formatado, como 11.222.333/0001-81).
 */
export function filtrarFornecedores(lista: Fornecedor[], busca: string) {
  const termo = busca.trim().toLowerCase()
  if (!termo) return lista
  const termoCnpj = normalizarCnpj(termo)
  return lista.filter(
    (item) =>
      item.razao_social.toLowerCase().includes(termo) ||
      (item.nome_fantasia ?? "").toLowerCase().includes(termo) ||
      (item.email ?? "").toLowerCase().includes(termo) ||
      (termoCnpj !== "" && normalizarCnpj(item.cnpj ?? "").includes(termoCnpj)),
  )
}
