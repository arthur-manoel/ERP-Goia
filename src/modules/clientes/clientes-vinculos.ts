import "server-only"
import { z } from "zod"
import { cliente_endereco_tipo, Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { serializarJsonTextMysql } from "@/lib/limites-texto"
import {
  ClienteError,
  gravacao as gravacaoCliente,
  type Contexto,
} from "./clientes.repository"

const idSchema = z.number().int().positive().max(2147483647)
const texto = (max: number) => z.string().trim().min(1).max(max)
const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional()
const contatoCampos = {
  tipo: texto(30).transform((v) => v.toUpperCase()),
  valor: texto(150),
  descricao: opcional(100),
  principal: z.boolean().optional().default(false),
}
const contatoBaseSchema = z.strictObject(contatoCampos)
export const contatoCriarSchema = contatoBaseSchema.superRefine((v, ctx) => {
  if (v.tipo === "EMAIL" && !z.email().safeParse(v.valor).success)
    ctx.addIssue({
      code: "custom",
      path: ["valor"],
      message: "E-mail inválido.",
    })
  if (
    ["TELEFONE", "CELULAR", "WHATSAPP"].includes(v.tipo) &&
    !/^\+?[\d\s().-]{8,30}$/.test(v.valor)
  )
    ctx.addIssue({
      code: "custom",
      path: ["valor"],
      message: "Telefone inválido.",
    })
})
export const contatoEditarSchema = contatoBaseSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Informe ao menos um campo.")

const cep = z
  .union([
    z.literal("").transform(() => null),
    z
      .string()
      .trim()
      .regex(/^\d{5}-?\d{3}$/, "CEP inválido.")
      .transform((v) => v.replace("-", "")),
  ])
  .nullable()
  .optional()
const enderecoCampos = {
  tipo: z.enum(cliente_endereco_tipo).optional().default("OUTRO"),
  descricao: opcional(100),
  endereco: texto(255),
  numero: opcional(20),
  complemento: opcional(100),
  bairro: opcional(100),
  cidade: opcional(100),
  estado: z
    .union([
      z.literal("").transform(() => null),
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{2}$/),
    ])
    .nullable()
    .optional(),
  cep,
  referencia: opcional(255),
  principal: z.boolean().optional().default(false),
}
export const enderecoCriarSchema = z.strictObject(enderecoCampos)
export const enderecoEditarSchema = enderecoCriarSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Informe ao menos um campo.")

function erroValidacao(error: z.ZodError): never {
  throw new ClienteError(400, error.issues[0]?.message ?? "Dados inválidos.")
}
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body)
  if (!result.success) erroValidacao(result.error)
  return result.data
}
async function clienteDaEmpresa(
  tx: Prisma.TransactionClient,
  ctx: Contexto,
  id: number,
) {
  const cliente = await tx.clientes.findFirst({
    where: { id, id_empresa: ctx.idEmpresa },
    select: { id: true },
  })
  if (!cliente) throw new ClienteError(404, "Cliente não encontrado.")
  return cliente
}
async function auditar(
  tx: Prisma.TransactionClient,
  ctx: Contexto,
  tabela: string,
  id: number,
  antes: unknown,
  depois: unknown,
  acao: "INSERT" | "UPDATE" | "DELETE",
) {
  await tx.auditoria.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_usuario: ctx.idUsuario,
      tabela,
      id_registro: id,
      acao,
      dados_anteriores:
        antes == null
          ? null
          : serializarJsonTextMysql(antes, (m) => new ClienteError(400, m)),
      dados_novos:
        depois == null
          ? null
          : serializarJsonTextMysql(depois, (m) => new ClienteError(400, m)),
    },
  })
}
async function clienteGravacao<T>(
  ctx: Contexto,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return gravacaoCliente(ctx, fn)
}

export async function listarContatos(ctx: Contexto, idCliente: number) {
  return prisma.$transaction(
    async (tx) => {
      await clienteDaEmpresa(tx, ctx, idCliente)
      const contatos = await tx.cliente_contato.findMany({
        where: { id_cliente: idCliente, ativo: true },
        orderBy: [{ principal: "desc" }, { id: "asc" }],
      })
      return { contatos }
    },
    { isolationLevel: "RepeatableRead" },
  )
}
export async function consultarContato(
  ctx: Contexto,
  idCliente: number,
  id: number,
) {
  return prisma.$transaction(
    async (tx) => {
      await clienteDaEmpresa(tx, ctx, idCliente)
      const contato = await tx.cliente_contato.findFirst({
        where: { id, id_cliente: idCliente, ativo: true },
      })
      if (!contato) throw new ClienteError(404, "Contato não encontrado.")
      return { contato }
    },
    { isolationLevel: "RepeatableRead" },
  )
}
export async function listarEnderecos(ctx: Contexto, idCliente: number) {
  return prisma.$transaction(
    async (tx) => {
      await clienteDaEmpresa(tx, ctx, idCliente)
      const enderecos = await tx.cliente_endereco.findMany({
        where: { id_cliente: idCliente, ativo: true },
        orderBy: [{ principal: "desc" }, { id: "asc" }],
      })
      return { enderecos }
    },
    { isolationLevel: "RepeatableRead" },
  )
}
export async function consultarEndereco(
  ctx: Contexto,
  idCliente: number,
  id: number,
) {
  return prisma.$transaction(
    async (tx) => {
      await clienteDaEmpresa(tx, ctx, idCliente)
      const endereco = await tx.cliente_endereco.findFirst({
        where: { id, id_cliente: idCliente, ativo: true },
      })
      if (!endereco) throw new ClienteError(404, "Endereço não encontrado.")
      return { endereco }
    },
    { isolationLevel: "RepeatableRead" },
  )
}
export async function criarContato(
  ctx: Contexto,
  idCliente: number,
  body: unknown,
) {
  const data = parse(contatoCriarSchema, body)
  return clienteGravacao(ctx, async (tx) => {
    await clienteDaEmpresa(tx, ctx, idCliente)
    if (data.principal)
      await tx.cliente_contato.updateMany({
        where: { id_cliente: idCliente, ativo: true },
        data: { principal: false },
      })
    const row = await tx.cliente_contato.create({
      data: { ...data, id_cliente: idCliente },
    })
    await auditar(tx, ctx, "cliente_contato", row.id, null, row, "INSERT")
    return row
  })
}
export async function editarContato(
  ctx: Contexto,
  idCliente: number,
  id: number,
  body: unknown,
) {
  const data = parse(contatoEditarSchema, body)
  return clienteGravacao(ctx, async (tx) => {
    await clienteDaEmpresa(tx, ctx, idCliente)
    const antes = await tx.cliente_contato.findFirst({
      where: { id, id_cliente: idCliente, ativo: true },
    })
    if (!antes) throw new ClienteError(404, "Contato não encontrado.")
    const atualizado = parse(contatoCriarSchema, {
      tipo: data.tipo ?? antes.tipo,
      valor: data.valor ?? antes.valor,
      descricao:
        data.descricao === undefined ? antes.descricao : data.descricao,
      principal: data.principal ?? antes.principal,
    })
    if (atualizado.principal)
      await tx.cliente_contato.updateMany({
        where: { id_cliente: idCliente, ativo: true, id: { not: id } },
        data: { principal: false },
      })
    const row = await tx.cliente_contato.update({
      where: { id },
      data: atualizado,
    })
    await auditar(tx, ctx, "cliente_contato", id, antes, row, "UPDATE")
    return row
  })
}
export async function excluirContato(
  ctx: Contexto,
  idCliente: number,
  id: number,
) {
  return clienteGravacao(ctx, async (tx) => {
    await clienteDaEmpresa(tx, ctx, idCliente)
    const antes = await tx.cliente_contato.findFirst({
      where: { id, id_cliente: idCliente, ativo: true },
    })
    if (!antes) throw new ClienteError(404, "Contato não encontrado.")
    const row = await tx.cliente_contato.update({
      where: { id },
      data: { ativo: false, principal: false },
    })
    await auditar(tx, ctx, "cliente_contato", id, antes, row, "UPDATE")
    return row
  })
}
export async function criarEndereco(
  ctx: Contexto,
  idCliente: number,
  body: unknown,
) {
  const data = parse(enderecoCriarSchema, body)
  return clienteGravacao(ctx, async (tx) => {
    await clienteDaEmpresa(tx, ctx, idCliente)
    const principal = data.principal || data.tipo === "PRINCIPAL"
    if (principal)
      await tx.cliente_endereco.updateMany({
        where: { id_cliente: idCliente, ativo: true },
        data: { principal: false },
      })
    const row = await tx.cliente_endereco.create({
      data: { ...data, principal, id_cliente: idCliente },
    })
    await auditar(tx, ctx, "cliente_endereco", row.id, null, row, "INSERT")
    return row
  })
}
export async function editarEndereco(
  ctx: Contexto,
  idCliente: number,
  id: number,
  body: unknown,
) {
  const data = parse(enderecoEditarSchema, body)
  return clienteGravacao(ctx, async (tx) => {
    await clienteDaEmpresa(tx, ctx, idCliente)
    const antes = await tx.cliente_endereco.findFirst({
      where: { id, id_cliente: idCliente, ativo: true },
    })
    if (!antes) throw new ClienteError(404, "Endereço não encontrado.")
    const principal =
      data.principal === true || data.tipo === "PRINCIPAL"
        ? true
        : data.principal
    if (principal)
      await tx.cliente_endereco.updateMany({
        where: { id_cliente: idCliente, ativo: true, id: { not: id } },
        data: { principal: false },
      })
    const row = await tx.cliente_endereco.update({
      where: { id },
      data: { ...data, principal },
    })
    await auditar(tx, ctx, "cliente_endereco", id, antes, row, "UPDATE")
    return row
  })
}
export async function excluirEndereco(
  ctx: Contexto,
  idCliente: number,
  id: number,
) {
  return clienteGravacao(ctx, async (tx) => {
    await clienteDaEmpresa(tx, ctx, idCliente)
    const antes = await tx.cliente_endereco.findFirst({
      where: { id, id_cliente: idCliente, ativo: true },
    })
    if (!antes) throw new ClienteError(404, "Endereço não encontrado.")
    const row = await tx.cliente_endereco.update({
      where: { id },
      data: { ativo: false, principal: false },
    })
    await auditar(tx, ctx, "cliente_endereco", id, antes, row, "UPDATE")
    return row
  })
}

export function parseId(valor: string) {
  const id = Number(valor)
  if (!/^[1-9]\d*$/.test(valor) || !Number.isSafeInteger(id) || id > 2147483647)
    throw new ClienteError(400, "Identificador inválido.")
  return idSchema.parse(id)
}
export async function jsonBody(request: Request) {
  try {
    return (await request.json()) as unknown
  } catch {
    throw new ClienteError(400, "JSON inválido.")
  }
}
export { ClienteError }
