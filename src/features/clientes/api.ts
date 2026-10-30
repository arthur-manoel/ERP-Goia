import { z } from "zod"
import {
  criarSchema,
  editarSchema,
  listarSchema,
} from "@/modules/clientes/clientes.schema"

const id = z.number().int().positive()
export const clienteApiSchema = z.object({
  id,
  id_empresa: id,
  nome_razao_social: z.string(),
  cpf_cnpj: z.string().nullable(),
  email: z.string().nullable(),
  telefone: z.string().nullable(),
  endereco: z.string().nullable(),
  numero: z.string().nullable(),
  complemento: z.string().nullable(),
  bairro: z.string().nullable(),
  cidade: z.string().nullable(),
  estado: z.string().nullable(),
  cep: z.string().nullable(),
  status: z.enum(["ATIVO", "INATIVO"]),
  data_cadastro: z.iso.datetime(),
  tipoPessoa: z.enum(["FISICA", "JURIDICA"]).nullable(),
})
const paginacaoSchema = z.object({
  pagina: id,
  limite: id,
  total: z.number().int().nonnegative(),
  totalPaginas: z.number().int().nonnegative(),
})
export type ClienteApi = z.infer<typeof clienteApiSchema>
export type CamposCliente = {
  nomeRazaoSocial: string
  cpfCnpj: string
  email: string
  telefone: string
  endereco: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  estado: string
  cep: string
}
export type FiltrosClientes = {
  nome: string
  cpfCnpj: string
  status: "" | "ATIVO" | "INATIVO"
}
export const filtrosIniciais: FiltrosClientes = {
  nome: "",
  cpfCnpj: "",
  status: "",
}
export type RequisitarClientes = (
  url: string,
  init?: RequestInit,
) => Promise<Response>

function respostaValida<T>(schema: z.ZodType<T>, body: unknown): T {
  const resultado = schema.safeParse(body)
  if (!resultado.success)
    throw new Error("Resposta de clientes inválida. Tente novamente.")
  return resultado.data
}

export function camposCliente(cliente?: ClienteApi): CamposCliente {
  return {
    nomeRazaoSocial: cliente?.nome_razao_social ?? "",
    cpfCnpj: cliente?.cpf_cnpj ?? "",
    email: cliente?.email ?? "",
    telefone: cliente?.telefone ?? "",
    endereco: cliente?.endereco ?? "",
    numero: cliente?.numero ?? "",
    complemento: cliente?.complemento ?? "",
    bairro: cliente?.bairro ?? "",
    cidade: cliente?.cidade ?? "",
    estado: cliente?.estado ?? "",
    cep: cliente?.cep ?? "",
  }
}

export function prepararCliente(campos: CamposCliente, cliente?: ClienteApi) {
  const anteriores = camposCliente(cliente)
  const entrada = Object.fromEntries(
    Object.entries(campos)
      .filter(
        ([campo, valor]) =>
          !cliente || valor !== anteriores[campo as keyof CamposCliente],
      )
      .map(([campo, valor]) => [
        campo,
        campo === "nomeRazaoSocial" ? valor : valor.trim() || null,
      ]),
  )
  return (cliente ? editarSchema : criarSchema).parse(entrada)
}

export function parametrosClientes(filtros: FiltrosClientes, pagina: number) {
  const entrada = {
    pagina: String(pagina),
    limite: "10",
    ...(filtros.nome.trim() ? { nome: filtros.nome.trim() } : {}),
    ...(filtros.cpfCnpj.trim() ? { cpfCnpj: filtros.cpfCnpj.trim() } : {}),
    ...(filtros.status ? { status: filtros.status } : {}),
  }
  const validado = listarSchema.parse(entrada)
  return new URLSearchParams(
    Object.entries(validado).map(([k, v]) => [k, String(v)]),
  )
}

async function pedir(
  requisitar: RequisitarClientes,
  idEmpresa: number,
  url: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers)
  headers.set("X-Empresa-Id", String(idEmpresa))
  const response = await requisitar(url, { ...init, headers })
  const body = await response.json().catch(() => null)
  if (!response.ok)
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : `Falha na requisição (${response.status}).`,
    )
  return body as unknown
}

function conferirCliente(
  cliente: ClienteApi,
  idEmpresa: number,
  idCliente?: number,
) {
  if (
    cliente.id_empresa !== idEmpresa ||
    (idCliente !== undefined && cliente.id !== idCliente)
  )
    throw new Error("Resposta de cliente incompatível com a consulta.")
  return cliente
}

export async function listarClientes(
  requisitar: RequisitarClientes,
  idEmpresa: number,
  filtros: FiltrosClientes,
  pagina: number,
  signal?: AbortSignal,
) {
  const query = parametrosClientes(filtros, pagina)
  const data = respostaValida(
    z.object({
      clientes: z.array(clienteApiSchema),
      paginacao: paginacaoSchema,
    }),
    await pedir(requisitar, idEmpresa, `/api/clientes?${query}`, { signal }),
  )
  data.clientes.forEach((cliente) => conferirCliente(cliente, idEmpresa))
  return data
}

export async function consultarCliente(
  requisitar: RequisitarClientes,
  idEmpresa: number,
  idCliente: number,
  signal?: AbortSignal,
) {
  const data = respostaValida(
    z.object({ cliente: clienteApiSchema }),
    await pedir(requisitar, idEmpresa, `/api/clientes/${idCliente}`, {
      signal,
    }),
  )
  return conferirCliente(data.cliente, idEmpresa, idCliente)
}

export async function salvarCliente(
  requisitar: RequisitarClientes,
  idEmpresa: number,
  campos: CamposCliente,
  cliente?: ClienteApi,
) {
  if (cliente) conferirCliente(cliente, idEmpresa)
  const payload = prepararCliente(campos, cliente)
  const data = respostaValida(
    z.object({ cliente: clienteApiSchema }),
    await pedir(
      requisitar,
      idEmpresa,
      cliente ? `/api/clientes/${cliente.id}` : "/api/clientes",
      {
        method: cliente ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    ),
  )
  return conferirCliente(data.cliente, idEmpresa, cliente?.id)
}

export async function alterarStatusCliente(
  requisitar: RequisitarClientes,
  idEmpresa: number,
  cliente: ClienteApi,
) {
  conferirCliente(cliente, idEmpresa)
  const data = respostaValida(
    z.object({ cliente: clienteApiSchema }),
    await pedir(
      requisitar,
      idEmpresa,
      `/api/clientes/${cliente.id}`,
      cliente.status === "ATIVO"
        ? { method: "DELETE" }
        : {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "ATIVO" }),
          },
    ),
  )
  return conferirCliente(data.cliente, idEmpresa, cliente.id)
}

export async function historicoCliente(
  requisitar: RequisitarClientes,
  idEmpresa: number,
  idCliente: number,
  pagina: number,
  signal?: AbortSignal,
) {
  const data = respostaValida(
    z.object({
      idCliente: id,
      pedidos: z.array(
        z.object({
          id,
          numero: z.string(),
          status: z.string(),
          data_venda: z.iso.datetime(),
          data_entrega: z.iso.datetime().nullable(),
          valor_total: z.string().regex(/^-?\d+(?:\.\d+)?$/),
        }),
      ),
      paginacao: paginacaoSchema,
    }),
    await pedir(
      requisitar,
      idEmpresa,
      `/api/clientes/${idCliente}/pedidos?pagina=${pagina}&limite=10`,
      { signal },
    ),
  )
  if (data.idCliente !== idCliente)
    throw new Error("Histórico incompatível com o cliente consultado.")
  return data
}
