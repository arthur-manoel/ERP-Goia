import { AsyncLocalStorage } from "node:async_hooks"
import { Prisma } from "../../src/generated/prisma/client"
import { prisma } from "../../src/lib/prisma"
import { serializarJsonTextMysql } from "../../src/lib/limites-texto"
import { ValidationError } from "../../src/lib/api/errors"
import { bloquearProdutoCatalogo } from "./transactions"

type Contexto = { idUsuario: number; empresas: number[] }
export const contextoAuditoriaCatalogo = new AsyncLocalStorage<Contexto>()
type Tabela =
  | "cores"
  | "tamanhos"
  | "tipos_produto"
  | "fornecedores"
  | "categorias"
  | "produtos"
type Registro = { id: number; id_empresa?: number | null }

/** Reutiliza transações existentes; escritas isoladas passam a ser atômicas com o log. */
export async function gravarCatalogo<T extends Registro>(
  tabela: Tabela,
  id: number | null,
  database: Prisma.TransactionClient | undefined,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const executar = async (tx: Prisma.TransactionClient) => {
    const ctx = contextoAuditoriaCatalogo.getStore()
    // A auditoria referencia empresas por FK. Bloquear primeiro o cadastro e
    // depois essa FK pode formar um ciclo com produção/categorias (empresa → cadastro).
    // As transações recebidas já seguem essa ordem em withCompanyWriteLock.
    if (database === undefined) {
      const empresas = new Set(ctx?.empresas ?? [])
      if (tabela === "produtos" && id !== null) {
        const links = await tx.produto_empresa.findMany({
          where: { id_produto: id },
          select: { id_empresa: true },
        })
        for (const link of links) empresas.add(link.id_empresa)
      }
      const ids = [...empresas].sort((a, b) => a - b)
      if (ids.length)
        await tx.$queryRaw`SELECT id FROM empresas WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`
    }
    // O lock do registro protege o snapshot anterior contra outra edição concorrente.
    if (id !== null) {
      switch (tabela) {
        case "cores":
          await tx.$queryRaw`SELECT id FROM cores WHERE id = ${id} FOR UPDATE`
          break
        case "tamanhos":
          await tx.$queryRaw`SELECT id FROM tamanhos WHERE id = ${id} FOR UPDATE`
          break
        case "tipos_produto":
          await tx.$queryRaw`SELECT id FROM tipos_produto WHERE id = ${id} FOR UPDATE`
          break
        case "fornecedores":
          await tx.$queryRaw`SELECT id FROM fornecedores WHERE id = ${id} FOR UPDATE`
          break
        case "categorias":
          await tx.$queryRaw`SELECT id FROM categorias WHERE id = ${id} FOR UPDATE`
          break
        case "produtos":
          await bloquearProdutoCatalogo(tx, id)
          break
      }
    }
    const ler = (registro: number) => {
      switch (tabela) {
        case "cores":
          return tx.cores.findUnique({ where: { id: registro } })
        case "tamanhos":
          return tx.tamanhos.findUnique({ where: { id: registro } })
        case "tipos_produto":
          return tx.tipos_produto.findUnique({ where: { id: registro } })
        case "fornecedores":
          return tx.fornecedores.findUnique({ where: { id: registro } })
        case "categorias":
          return tx.categorias.findUnique({ where: { id: registro } })
        case "produtos":
          return tx.produtos.findUnique({ where: { id: registro } })
      }
    }
    const antes = id === null ? null : ((await ler(id)) ?? null)
    const result = await operation(tx)
    const depois = result
    const serializar = (v: unknown) =>
      v === null
        ? null
        : serializarJsonTextMysql(v, (m) => new ValidationError(m))
    const dadosAnteriores = serializar(antes)
    const dadosNovos = serializar(depois)
    if (dadosAnteriores === dadosNovos) return result
    const empresaAntes =
      antes && "id_empresa" in antes ? antes.id_empresa : undefined
    const transferencia =
      tabela !== "produtos" &&
      antes !== null &&
      empresaAntes !== depois.id_empresa
    const proprietarios = (v: Registro | null): number[] => {
      if (!v) return []
      return v.id_empresa != null ? [v.id_empresa] : []
    }
    const empresas = [
      ...new Set([...proprietarios(antes), ...proprietarios(depois)]),
    ]
    if (tabela === "produtos") {
      const links = await tx.produto_empresa.findMany({
        where: { id_produto: result.id },
        select: { id_empresa: true },
      })
      empresas.push(...links.map((p) => p.id_empresa))
    }
    // Tipos de produto são globais; o evento pertence às empresas do autor no momento da operação.
    const destinos: Array<number | null> = empresas.length
      ? [...new Set(empresas)]
      : ctx?.empresas.length
        ? ctx.empresas
        : [null]
    for (const idEmpresa of destinos)
      await tx.auditoria.create({
        data: {
          id_empresa: idEmpresa,
          id_usuario: ctx?.idUsuario ?? null,
          tabela,
          id_registro: result.id,
          acao: antes ? "UPDATE" : "INSERT",
          dados_anteriores:
            transferencia && idEmpresa !== empresaAntes
              ? null
              : dadosAnteriores,
          dados_novos:
            transferencia && idEmpresa !== depois.id_empresa
              ? null
              : dadosNovos,
        },
      })
    return result
  }
  return database === undefined
    ? prisma.$transaction(executar, { isolationLevel: "ReadCommitted" })
    : executar(database)
}
