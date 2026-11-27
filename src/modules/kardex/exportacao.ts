import "server-only"
import PDFDocument from "pdfkit"
import { join } from "node:path"
import { Prisma } from "@/generated/prisma/client"
import { HttpError } from "@/lib/api/errors"
import { formatarDataHora } from "@/lib/formatacao"
import { prisma } from "@/lib/prisma"
import { conferir, type Contexto } from "@/modules/reservas/operacoes"
import { lerMovimentos } from "@/modules/movimentacoes-estoque/historico"
import {
  apresentar,
  consultaPagina,
  validarReferencias,
  type Linha,
} from "./kardex.repository"
import type { Consulta } from "./kardex.schema"

export type Escopo = "kardex" | "movimentacoes"
export type Formato = "csv" | "pdf"
type Registro =
  | Awaited<ReturnType<typeof lerMovimentos>>[number]
  | ReturnType<typeof apresentar>
const limites = { csv: 5_000, pdf: 500 }

export async function consultarExportacao(
  ctx: Contexto,
  filtros: Consulta,
  escopo: Escopo,
  formato: Formato,
) {
  return prisma.$transaction(
    async (tx) => {
      await conferir(tx, ctx, [
        ["ESTOQUE", "ler"],
        ["RELATORIOS", "ler"],
      ])
      await validarReferencias(tx, ctx.idEmpresa, filtros, escopo)
      const limite = limites[formato]
      const f = { ...filtros, pagina: 1 }
      const linhas: Registro[] =
        escopo === "kardex"
          ? (
              await tx.$queryRaw<Linha[]>(
                consultaPagina(ctx.idEmpresa, f, limite + 1),
              )
            ).map(apresentar)
          : await lerMovimentos(tx, ctx, f, limite + 1, 0)
      if (linhas.length > limite)
        throw new HttpError(
          413,
          `A exportação ${formato.toUpperCase()} aceita até ${limite} lançamentos. Reduza o período ou refine os filtros.`,
        )
      const empresa = await tx.empresas.findUniqueOrThrow({
        where: { id: ctx.idEmpresa },
        select: { id: true, razao_social: true },
      })
      return { linhas, empresa }
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 20_000,
    },
  )
}

export function celulaCsv(valor: string, numerico = false) {
  // A planilha pode ignorar espaços e caracteres de controle antes de uma fórmula.
  const segura =
    !numerico &&
    (/^[\s\p{Cc}\p{Cf}]*[=+\-@]/u.test(valor.normalize("NFKC")) ||
      /^[\t\r\n]/.test(valor))
      ? "'" + valor
      : valor
  return '"' + segura.replaceAll('"', '""') + '"'
}

type Relatorio = Awaited<ReturnType<typeof consultarExportacao>>
const texto = (v: string | number | null | undefined) =>
  v == null ? "" : String(v)
const variacao = (r: Registro) =>
  r.variacao
    ? [r.variacao.cor, r.variacao.tamanho].filter(Boolean).join(" / ") ||
      `#${r.variacao.id}`
    : ""
const origem = (r: Registro) =>
  r.origem
    ? r.origem.tipo + (r.origem.id === null ? "" : ` #${r.origem.id}`)
    : ""
const textoPdf = (v: string | null | undefined) =>
  texto(v).normalize("NFC").replace(/\s+/g, " ").trim()
const decimalCsv = (v: string | null | undefined) => texto(v).replace(".", ",")

export function gerarCsv(dados: Relatorio, escopo: Escopo, gerado: Date) {
  const titulos = [
    "Empresa ID",
    "Empresa",
    "Gerado em UTC",
    "Registro ID",
    "Movimento ID",
    "Data efetiva UTC",
    "Produto ID",
    "Produto",
    "Unidade",
    "Variação ID",
    "Variação",
    "Local ID",
    "Local",
    "Setor ID",
    "Setor",
    "Direção",
    "Tipo",
    "Quantidade",
    "Origem",
    "Observação",
    ...(escopo === "kardex"
      ? [
          "Saldo agregado anterior",
          "Saldo agregado posterior",
          "Situação do saldo",
        ]
      : []),
  ]
  const linhas = dados.linhas.map((r) => {
    const cols = [
      texto(dados.empresa.id),
      dados.empresa.razao_social,
      gerado.toISOString(),
      texto(r.id),
      texto(r.idMovimentacao),
      texto(r.dataMovimentacao),
      texto(r.produto?.id),
      texto(r.produto?.nome),
      texto(r.produto?.unidade),
      texto(r.variacao?.id),
      variacao(r),
      texto(r.localEstoque?.id),
      texto(r.localEstoque?.nome),
      texto(r.setor?.id),
      texto(r.setor?.nome),
      r.direcao,
      texto(r.tipo),
      decimalCsv(r.quantidade),
      origem(r),
      texto(r.observacao),
    ]
    if ("saldo" in r)
      cols.push(
        decimalCsv(r.saldo.anterior),
        decimalCsv(r.saldo.posterior),
        r.saldo.situacao,
      )
    return cols
      .map((v, i) =>
        celulaCsv(v, [0, 3, 4, 6, 9, 11, 13, 17, 20, 21].includes(i)),
      )
      .join(";")
  })
  return (
    "\uFEFF" +
    [titulos.map((v) => celulaCsv(v)).join(";"), ...linhas].join("\r\n") +
    "\r\n"
  )
}

function descreverFiltros(f: Consulta) {
  const pares = [
    ["Produto", f.idProduto],
    ["Variação", f.idVariacao],
    ["Local", f.idLocalEstoque],
    ["Setor", f.idSetor],
    ["Direção", f.direcao],
    ["Tipo", f.tipo],
    ["Origem", f.origemTipo],
    ["ID da origem", f.origemId],
    ["Movimento", f.idMovimentacao],
  ]
  return [
    `Período ${f.periodo.dataInicio} a ${f.periodo.dataFim}`,
    ...pares.flatMap(([label, valor]) => (valor ? [`${label} ${valor}`] : [])),
  ].join(" | ")
}

export async function gerarPdf(
  dados: Relatorio,
  escopo: Escopo,
  filtros: Consulta,
  gerado: Date,
) {
  const titulo =
    escopo === "kardex" ? "Kardex de estoque" : "Movimentações de estoque"
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 32,
    autoFirstPage: false,
    info: { Title: titulo },
  })
  const fonte = join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf")
  doc.registerFont("Relatorio", join(fonte, "DejaVuSans.ttf"))
  doc.registerFont("RelatorioNegrito", join(fonte, "DejaVuSans-Bold.ttf"))
  const partes: Uint8Array<ArrayBuffer>[] = []
  const fim = new Promise<Blob>((resolve, reject) => {
    doc.on("error", reject)
    doc.on("data", (chunk: Buffer) => partes.push(new Uint8Array(chunk)))
    doc.on("end", () => resolve(new Blob(partes, { type: "application/pdf" })))
  })
  const larguras = [92, 170, 133, 105, 95, 171]
  const x = 32
  let y = 0
  let pagina = 0
  function novaPagina() {
    doc.addPage()
    pagina++
    doc
      .font("RelatorioNegrito")
      .fontSize(16)
      .fillColor("#172b40")
      .text(titulo, x, 30)
    doc
      .font("Relatorio")
      .fontSize(9)
      .fillColor("#263544")
      .text(
        `Empresa ${textoPdf(dados.empresa.razao_social)} (#${dados.empresa.id}) | Gerado em ${formatarDataHora(gerado)} (São Paulo) | Página ${pagina}`,
        x,
        doc.y + 5,
        { width: 770 },
      )
      .text(descreverFiltros(filtros), { width: 770 })
      .text(
        `${dados.linhas.length} lançamentos | Ordem: data e ID decrescentes${escopo === "kardex" ? " | Saldos da posição agregada" : ""}`,
        { width: 770 },
      )
    y = doc.y + 12
    doc.rect(x, y, 766, 22).fill("#172b40")
    doc.font("RelatorioNegrito").fontSize(9).fillColor("#ffffff")
    let cursor = x
    for (const [i, label] of [
      "Data / ID",
      "Produto / variação",
      "Local / setor",
      "Direção / tipo",
      "Qtd. / saldo",
      "Origem / observação",
    ].entries()) {
      doc.text(label, cursor + 4, y + 6, { width: larguras[i] - 8 })
      cursor += larguras[i]
    }
    y += 22
  }
  novaPagina()
  if (!dados.linhas.length)
    doc
      .font("Relatorio")
      .fontSize(10)
      .fillColor("#263544")
      .text("Nenhum lançamento para os filtros aplicados.", x, y + 8)
  for (const [i, r] of dados.linhas.entries()) {
    const cols = [
      [
        r.dataMovimentacao
          ? formatarDataHora(new Date(r.dataMovimentacao))
          : "Data indisponível",
        `#${r.id}`,
      ].join("\n"),
      [
        textoPdf(r.produto?.nome) || "Produto indisponível",
        textoPdf(variacao(r)),
      ]
        .filter(Boolean)
        .join("\n"),
      [textoPdf(r.localEstoque?.nome), textoPdf(r.setor?.nome)]
        .filter(Boolean)
        .join("\n") || "—",
      [r.direcao, r.tipo].filter(Boolean).join("\n"),
      [
        r.quantidade
          ? `${decimalCsv(r.quantidade)} ${r.produto?.unidade ?? ""}`
          : "—",
        ...("saldo" in r
          ? [
              r.saldo.situacao === "DIVERGENTE"
                ? "Saldo divergente"
                : `Antes ${decimalCsv(r.saldo.anterior)}\nApós ${decimalCsv(r.saldo.posterior)}`,
            ]
          : []),
      ].join("\n"),
      [textoPdf(origem(r)), textoPdf(r.observacao)]
        .filter(Boolean)
        .join("\n") || "—",
    ]
    doc.font("Relatorio").fontSize(8.5)
    const altura = Math.max(
      26,
      ...cols.map(
        (col, j) => doc.heightOfString(col, { width: larguras[j] - 8 }) + 10,
      ),
    )
    if (y + altura > doc.page.height - 34) {
      novaPagina()
      doc.font("Relatorio").fontSize(8.5)
    }
    doc
      .rect(x, y, 766, altura)
      .fill(i % 2 ? "#edf1f5" : "#ffffff")
      .fillColor("#172b40")
    let cursor = x
    cols.forEach((col, j) => {
      doc.text(col, cursor + 4, y + 5, { width: larguras[j] - 8 })
      cursor += larguras[j]
    })
    y += altura
  }
  doc.end()
  return fim
}
