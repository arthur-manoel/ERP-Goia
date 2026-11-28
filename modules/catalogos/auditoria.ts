import { AsyncLocalStorage } from "node:async_hooks"
import { Prisma } from "../../src/generated/prisma/client"
import { prisma } from "../../src/lib/prisma"
import { serializarJsonTextMysql } from "../../src/lib/limites-texto"
import { ConflictError, ValidationError } from "../../src/lib/api/errors"
import { bloquearProdutoCatalogo } from "./transactions"

type Contexto = { idUsuario: number; empresas: number[] }
export const contextoAuditoriaCatalogo = new AsyncLocalStorage<Contexto>()
type Tabela =
  | "cores"
  | "tamanhos"
  | "tipos_produto"
  | "fornecedores"
  | "categorias"
  | "locais_estoque"
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
        case "locais_estoque":
          await tx.$queryRaw`SELECT id FROM locais_estoque WHERE id = ${id} FOR UPDATE`
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
        case "locais_estoque":
          return tx.locais_estoque.findUnique({ where: { id: registro } })
        case "produtos":
          return tx.produtos.findUnique({ where: { id: registro } })
      }
    }
    const antes = id === null ? null : ((await ler(id)) ?? null)
    const result = await operation(tx)
    const depois = result
    // O cadastro e a expedição já bloqueiam a empresa. A recusa aqui
    // reverte a atualização antes de confirmar o cadastro e sua auditoria.
    const inativou =
      antes &&
      "status" in depois &&
      ((antes.status === "ATIVO" && depois.status === "INATIVO") ||
        (antes.status === "ATIVA" && depois.status === "INATIVA"))
    const desativouEstoque =
      tabela === "produtos" &&
      antes &&
      "controla_estoque" in antes &&
      antes.controla_estoque &&
      "controla_estoque" in depois &&
      depois.controla_estoque === false
    if (inativou || desativouEstoque) {
      const filtro = (() => {
        if (tabela === "produtos") return { id_produto: depois.id }
        if (depois.id_empresa == null) return null
        const escopo = { id_empresa: depois.id_empresa }
        if (tabela === "locais_estoque")
          return { ...escopo, id_local_destino: depois.id }
        if (tabela === "cores")
          return { ...escopo, produto_variacoes: { id_cor: depois.id } }
        if (tabela === "tamanhos")
          return { ...escopo, produto_variacoes: { id_tamanho: depois.id } }
        return null
      })()
      if (
        filtro &&
        (await tx.transferencia_estoque.findFirst({
          where: { ...filtro, status: "ENVIADA" },
          select: { id: true },
        }))
      )
        throw new ConflictError(
          "Este cadastro é necessário para receber peças em trânsito. Confirme o recebimento antes de inativar ou desativar o estoque.",
        )
    }
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
