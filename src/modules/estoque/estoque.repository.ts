import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { EstoqueError } from "./estoque.error"
import type { CriarVinculoInput, FiltrosEstoque } from "./estoque.schema"

type Linha = {
  idEstoque: number
  idProduto: number
  codigo: string
  codigoInterno: string | null
  produto: string
  unidade: string
  statusProduto: string
  statusNaEmpresa: string
  idLocal: number
  local: string
  statusLocal: string
  idSetor: number
  setor: string
  statusSetor: string
  fisica: Prisma.Decimal
  reservada: Prisma.Decimal
  disponivel: Prisma.Decimal
  atualizadoEm: Date
}

const colunas = Prisma.sql`
  e.id AS idEstoque, p.id AS idProduto, p.codigo,
  pe.codigo_interno AS codigoInterno, p.nome AS produto, p.unidade,
  p.status AS statusProduto, pe.status AS statusNaEmpresa,
  l.id AS idLocal, l.nome AS local, l.status AS statusLocal,
  s.id AS idSetor, s.nome AS setor, s.status AS statusSetor,
  e.quantidade AS fisica, e.quantidade_reservada AS reservada,
  (e.quantidade - e.quantidade_reservada) AS disponivel,
  e.data_atualizacao AS atualizadoEm`

function escopo(idEmpresa: number, condicoes: Prisma.Sql[] = []) {
  return Prisma.sql`
    FROM estoque e
    JOIN locais_estoque l ON l.id = e.id_local_estoque AND l.id_empresa = e.id_empresa
    JOIN setores s ON s.id = e.id_setor AND s.id_empresa = e.id_empresa
    JOIN produtos p ON p.id = e.id_produto
    JOIN produto_empresa pe ON pe.id_produto = e.id_produto AND pe.id_empresa = e.id_empresa
    WHERE ${Prisma.join([Prisma.sql`e.id_empresa = ${idEmpresa}`, ...condicoes], " AND ")}`
}

function serializar(linha: Linha) {
  return {
    idEstoque: linha.idEstoque,
    produto: {
      id: linha.idProduto,
      codigo: linha.codigo,
      codigoInterno: linha.codigoInterno,
      nome: linha.produto,
      unidade: linha.unidade,
      status: linha.statusProduto,
      statusNaEmpresa: linha.statusNaEmpresa,
    },
    localEstoque: {
      id: linha.idLocal,
      nome: linha.local,
      status: linha.statusLocal,
    },
    setor: { id: linha.idSetor, nome: linha.setor, status: linha.statusSetor },
    quantidadeFisica: linha.fisica.toFixed(3),
    quantidadeReservada: linha.reservada.toFixed(3),
    quantidadeDisponivel: linha.disponivel.toFixed(3),
    atualizadoEm: linha.atualizadoEm.toISOString(),
  }
}

export type PosicaoEstoque = ReturnType<typeof serializar>

export async function listarEstoque(
  idEmpresa: number,
  filtros: FiltrosEstoque,
) {
  const condicoes: Prisma.Sql[] = []
  if (filtros.id_produto !== undefined)
    condicoes.push(Prisma.sql`e.id_produto = ${filtros.id_produto}`)
  if (filtros.id_local_estoque !== undefined)
    condicoes.push(Prisma.sql`e.id_local_estoque = ${filtros.id_local_estoque}`)
  if (filtros.id_setor !== undefined)
    condicoes.push(Prisma.sql`e.id_setor = ${filtros.id_setor}`)
  if (!filtros.incluir_zerados) condicoes.push(Prisma.sql`e.quantidade <> 0`)
  if (filtros.busca)
    condicoes.push(Prisma.sql`(LOCATE(${filtros.busca}, p.nome) > 0
      OR LOCATE(${filtros.busca}, p.codigo) > 0
      OR LOCATE(${filtros.busca}, pe.codigo_interno) > 0)`)
  const filtro = escopo(idEmpresa, condicoes)
  // COUNT e página compartilham o snapshot; nenhum bloqueio de escrita no GET.
  return prisma.$transaction(
    async (tx) => {
      const [contagem] = await tx.$queryRaw<{ registros: bigint }[]>(Prisma.sql`
        SELECT COUNT(*) AS registros ${filtro}`)
      const linhas = await tx.$queryRaw<Linha[]>(Prisma.sql`
        SELECT ${colunas} ${filtro}
        ORDER BY e.id ASC
        LIMIT ${filtros.limite} OFFSET ${(filtros.pagina - 1) * filtros.limite}`)
      const totalRegistros = Number(contagem.registros)
      return {
        dados: linhas.map(serializar),
        paginacao: {
          pagina: filtros.pagina,
          limite: filtros.limite,
          totalRegistros,
          totalPaginas: Math.ceil(totalRegistros / filtros.limite),
        },
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  )
}

export async function detalharEstoque(idEmpresa: number, idEstoque: number) {
  const [linha] = await prisma.$queryRaw<Linha[]>(Prisma.sql`
    SELECT ${colunas} ${escopo(idEmpresa, [Prisma.sql`e.id = ${idEstoque}`])}
    LIMIT 1`)
  if (!linha) throw new EstoqueError(404, "Posição de estoque não encontrada.")
  return serializar(linha)
}

type Contexto = { idEmpresa: number; idUsuario: number }
type Referencia = {
  id: number
  id_produto: number
  id_local_estoque: number
  id_setor: number
}

function confirmar(posicao: Referencia, criado: boolean) {
  // Criação não concede leitura: nenhuma quantidade, nome ou custo nesta resposta.
  return {
    idEstoque: posicao.id,
    idProduto: posicao.id_produto,
    idLocalEstoque: posicao.id_local_estoque,
    idSetor: posicao.id_setor,
    criado,
  }
}

async function criarNaTransacao(
  tx: Prisma.TransactionClient,
  contexto: Contexto,
  dados: CriarVinculoInput,
) {
  const [local, setor, produto] = await Promise.all([
    tx.locais_estoque.findFirst({
      where: { id: dados.idLocalEstoque, id_empresa: contexto.idEmpresa },
      select: { id: true, status: true },
    }),
    tx.setores.findFirst({
      where: { id: dados.idSetor, id_empresa: contexto.idEmpresa },
      select: { id: true, status: true },
    }),
    tx.produto_empresa.findUnique({
      where: {
        id_empresa_id_produto: {
          id_empresa: contexto.idEmpresa,
          id_produto: dados.idProduto,
        },
      },
      select: {
        status: true,
        produtos: { select: { status: true, controla_estoque: true } },
      },
    }),
  ])
  if (!local || !setor || !produto)
    throw new EstoqueError(
      404,
      "Produto, local ou setor não encontrado na empresa.",
    )

  const existente = await tx.estoque.findFirst({
    where: {
      id_empresa: contexto.idEmpresa,
      id_produto: dados.idProduto,
      OR: [
        { id_local_estoque: dados.idLocalEstoque },
        { id_setor: dados.idSetor },
      ],
    },
    select: {
      id: true,
      id_produto: true,
      id_local_estoque: true,
      id_setor: true,
    },
    orderBy: { id: "asc" },
  })
  if (existente) {
    if (
      existente.id_local_estoque === dados.idLocalEstoque &&
      existente.id_setor === dados.idSetor
    )
      return confirmar(existente, false)
    if (existente.id_local_estoque === dados.idLocalEstoque)
      throw new EstoqueError(
        409,
        "O produto já está vinculado ao local com outro setor.",
      )
    throw new EstoqueError(
      409,
      "O produto já está vinculado ao setor em outro local.",
    )
  }

  if (
    local.status !== "ATIVO" ||
    setor.status !== "ATIVO" ||
    produto.status !== "ATIVO" ||
    produto.produtos.status !== "ATIVO" ||
    !produto.produtos.controla_estoque
  )
    throw new EstoqueError(
      409,
      "O vínculo exige produto habilitado e ativo com controle de estoque, local e setor ativos.",
    )

  const posicao = await tx.estoque.create({
    data: {
      id_empresa: contexto.idEmpresa,
      id_produto: dados.idProduto,
      id_local_estoque: dados.idLocalEstoque,
      id_setor: dados.idSetor,
      quantidade: "0.000",
      quantidade_reservada: "0.000",
    },
    select: {
      id: true,
      id_produto: true,
      id_local_estoque: true,
      id_setor: true,
    },
  })
  await tx.auditoria.create({
    data: {
      id_empresa: contexto.idEmpresa,
      id_usuario: contexto.idUsuario,
      tabela: "estoque",
      id_registro: posicao.id,
      acao: "INSERT",
      dados_novos: JSON.stringify({
        ...dados,
        quantidade: "0.000",
        quantidadeReservada: "0.000",
      }),
    },
  })
  return confirmar(posicao, true)
}

export async function criarVinculoEstoque(
  contexto: Contexto,
  dados: CriarVinculoInput,
) {
  // As duas chaves UNIQUE são a proteção final. Cada repetição usa nova transação,
  // permitindo ler o vencedor após rollback de uma disputa ou deadlock InnoDB.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    try {
      return await prisma.$transaction(
        (tx) => criarNaTransacao(tx, contexto, dados),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error
      if (["P2002", "P2034"].includes(error.code)) {
        if (tentativa < 4) {
          await new Promise((resolve) =>
            setTimeout(resolve, 10 * (tentativa + 1)),
          )
          continue
        }
        throw new EstoqueError(
          409,
          "O vínculo está sendo criado por outra operação. Repita a requisição.",
        )
      }
      if (["P2003", "P2025"].includes(error.code))
        throw new EstoqueError(
          409,
          "Uma relação necessária ao vínculo foi alterada. Atualize e tente novamente.",
        )
      throw error
    }
  }
  throw new EstoqueError(
    409,
    "Não foi possível confirmar o vínculo concorrente.",
  )
}
