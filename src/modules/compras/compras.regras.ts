// Regras puras do módulo de compras (sem acesso a banco), cobertas por testes unitários.
// Valores monetários e quantidades usam BigInt em escala fixa para evitar erros de ponto flutuante:
// quantidade = Decimal(15,3) e valores = Decimal(15,2), como no schema.

export const CASAS_QUANTIDADE = 3
export const CASAS_VALOR = 2
const MAX_DIGITOS = 15

const formato = /^\d+(\.\d+)?$/

/** Maior valor escalado que cabe em DECIMAL(15,x): 15 dígitos, ou seja, 10^15 − 1 na escala. */
export const MAX_ESCALADO = BigInt(10) ** BigInt(MAX_DIGITOS) - BigInt(1)

/** Resultado de cálculo que não cabe na coluna do banco (tratado como 400, nunca 500). */
export class ValorForaDoLimite extends Error {
  constructor(
    mensagem = "O valor calculado excede o limite permitido (13 dígitos inteiros).",
  ) {
    super(mensagem)
    this.name = "ValorForaDoLimite"
  }
}

/** Converte "12.5" ou 12.5 para o inteiro escalado (12500 com 3 casas). Retorna null se inválido. */
export function paraEscala(
  valor: string | number,
  casas: number,
): bigint | null {
  const texto = typeof valor === "number" ? String(valor) : valor.trim()
  if (!formato.test(texto)) return null // rejeita sinal, expoente, vírgula e vazio
  const [inteira, fracao = ""] = texto.split(".")
  if (fracao.length > casas) return null
  if (inteira.replace(/^0+(?=\d)/, "").length > MAX_DIGITOS - casas) return null
  return BigInt(inteira + fracao.padEnd(casas, "0"))
}

export function deEscala(valor: bigint, casas: number): string {
  const texto = valor.toString().padStart(casas + 1, "0")
  return `${texto.slice(0, -casas)}.${texto.slice(-casas)}`
}

export function quantidadeValida(valor: string | number) {
  const escala = paraEscala(valor, CASAS_QUANTIDADE)
  return escala !== null && escala > BigInt(0)
}
export function valorValido(valor: string | number) {
  return paraEscala(valor, CASAS_VALOR) !== null
}

/** quantidade (3 casas) × valor unitário (2 casas), arredondado meio-para-cima em 2 casas. */
export function totalItem(quantidade: string, valorUnitario: string): string {
  const q = paraEscala(quantidade, CASAS_QUANTIDADE)
  const v = paraEscala(valorUnitario, CASAS_VALOR)
  if (q === null || v === null) throw new Error("Valores numéricos inválidos.")
  const bruto = q * v // escala 10^-5
  const centavos = (bruto + BigInt(500)) / BigInt(1000)
  if (centavos > MAX_ESCALADO)
    throw new ValorForaDoLimite(
      "O total do item excede o limite permitido (13 dígitos inteiros).",
    )
  return deEscala(centavos, CASAS_VALOR)
}

export function somarValores(
  valores: Array<string | { toString(): string }>,
): string {
  let soma = BigInt(0)
  for (const valor of valores) {
    const escala = paraEscala(valor.toString(), CASAS_VALOR)
    if (escala === null) throw new Error("Valor monetário inválido.")
    soma += escala
    if (soma > MAX_ESCALADO)
      throw new ValorForaDoLimite(
        "A soma dos valores excede o limite permitido (13 dígitos inteiros).",
      )
  }
  return deEscala(soma, CASAS_VALOR)
}

/** Soma de quantidades (3 casas) com checagem do limite de DECIMAL(15,3). */
export function somarQuantidades(a: string, b: string): string {
  const x = paraEscala(a, CASAS_QUANTIDADE)
  const y = paraEscala(b, CASAS_QUANTIDADE)
  if (x === null || y === null) throw new Error("Quantidade inválida.")
  if (x + y > MAX_ESCALADO)
    throw new ValorForaDoLimite("A quantidade total excede o limite permitido.")
  return deEscala(x + y, CASAS_QUANTIDADE)
}

/** Pendente = pedida − recebida, nunca negativa. */
export function quantidadePendente(pedida: string, recebida: string): string {
  const p = paraEscala(pedida, CASAS_QUANTIDADE)
  const r = paraEscala(recebida, CASAS_QUANTIDADE)
  if (p === null || r === null) throw new Error("Quantidade inválida.")
  return deEscala(p > r ? p - r : BigInt(0), CASAS_QUANTIDADE)
}

export function excedeQuantidade(limite: string, informada: string) {
  const l = paraEscala(limite, CASAS_QUANTIDADE)
  const i = paraEscala(informada, CASAS_QUANTIDADE)
  return l === null || i === null ? true : i > l
}

export function idsDuplicados(ids: number[]) {
  return new Set(ids).size !== ids.length
}

// ---------------------------------------------------------------- status

export type StatusRequisicao =
  "RASCUNHO" | "ABERTA" | "APROVADA" | "ATENDIDA" | "CANCELADA"
export type StatusPedido =
  "RASCUNHO" | "EMITIDO" | "PARCIAL" | "RECEBIDO" | "CANCELADO"
export type StatusCompra = "RASCUNHO" | "EMITIDA" | "ENTREGUE" | "CANCELADA"
export type StatusNota = "PENDENTE" | "RECEBIDA" | "CANCELADA"

// ATENDIDA só é alcançada ao converter a solicitação em pedido (nunca por ação direta).
export const transicoesRequisicao: Record<
  string,
  Partial<Record<StatusRequisicao, StatusRequisicao>>
> = {
  enviar: { RASCUNHO: "ABERTA" },
  aprovar: { ABERTA: "APROVADA" },
  cancelar: {
    RASCUNHO: "CANCELADA",
    ABERTA: "CANCELADA",
    APROVADA: "CANCELADA",
  },
}
export const transicoesPedido: Record<
  string,
  Partial<Record<StatusPedido, StatusPedido>>
> = {
  emitir: { RASCUNHO: "EMITIDO" },
  cancelar: { RASCUNHO: "CANCELADO", EMITIDO: "CANCELADO" },
}
export const transicoesCompra: Record<
  string,
  Partial<Record<StatusCompra, StatusCompra>>
> = {
  receber: { EMITIDA: "ENTREGUE" },
  cancelar: { RASCUNHO: "CANCELADA", EMITIDA: "CANCELADA" },
}
export const transicoesNota: Record<
  string,
  Partial<Record<StatusNota, StatusNota>>
> = {
  receber: { PENDENTE: "RECEBIDA" },
  cancelar: { PENDENTE: "CANCELADA", RECEBIDA: "CANCELADA" },
}

export function proximoStatus<S extends string>(
  tabela: Record<string, Partial<Record<S, S>>>,
  acao: string,
  atual: S,
): S | null {
  return tabela[acao]?.[atual] ?? null
}

export type SituacaoRecebimento = "PENDENTE" | "PARCIAL" | "TOTAL"

/** Situação derivada das quantidades da compra (o enum do banco não tem "parcial"). */
export function situacaoRecebimento(
  itens: Array<{ pedida: string; recebida: string }>,
): SituacaoRecebimento {
  const zero = BigInt(0)
  const recebido = itens.some((i) => (paraEscala(i.recebida, 3) ?? zero) > zero)
  if (!recebido) return "PENDENTE"
  const completo = itens.every(
    (i) =>
      (paraEscala(i.recebida, 3) ?? zero) >= (paraEscala(i.pedida, 3) ?? zero),
  )
  return completo ? "TOTAL" : "PARCIAL"
}

/** Datas AAAA-MM-DD: calendário real e ano entre 1900 e 2100 (evita RangeError e limites do banco). */
export function diaValido(valor: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
  if (!m) return false
  const [ano, mes, diaMes] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (ano < 1900 || ano > 2100) return false
  const d = new Date(Date.UTC(ano, mes - 1, diaMes))
  return (
    d.getUTCFullYear() === ano &&
    d.getUTCMonth() === mes - 1 &&
    d.getUTCDate() === diaMes
  )
}

/** Pedido fica RECEBIDO só se nenhum item ficou pendente; caso contrário, PARCIAL. */
export function statusPedidoAposRecebimento(
  itens: Array<{ pedida: string; recebida: string }>,
): "RECEBIDO" | "PARCIAL" {
  const zero = BigInt(0)
  return itens.every(
    (item) =>
      paraEscala(
        quantidadePendente(item.pedida, item.recebida),
        CASAS_QUANTIDADE,
      ) === zero,
  )
    ? "RECEBIDO"
    : "PARCIAL"
}

// ---------------------------------------------------------------- nota fiscal

/** Valida os 44 dígitos da chave de acesso e o dígito verificador (módulo 11, pesos 2–9). */
export function chaveAcessoValida(chave: string): boolean {
  if (!/^\d{44}$/.test(chave) || /^(\d)\1{43}$/.test(chave)) return false
  let soma = 0
  let peso = 2
  for (let i = 42; i >= 0; i--) {
    soma += Number(chave[i]) * peso
    peso = peso === 9 ? 2 : peso + 1
  }
  const resto = soma % 11
  const dv = resto < 2 ? 0 : 11 - resto
  return dv === Number(chave[43])
}

export function normalizarChave(chave: string) {
  return chave.replace(/[\s.]/g, "")
}
