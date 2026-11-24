import "server-only"

import { readBearer } from "@/lib/authorize"
import { ValidationError } from "@/lib/api/errors"
import { readLimitedJson, readQuery, validate } from "@/lib/api/http"
import { catalogRequest } from "../../catalogos/access"
import type { Action } from "../../catalogos/repository"
import {
  consultarFornecedor,
  criarFornecedor,
  editarFornecedor,
  listarFornecedores,
  listarOpcoes,
} from "./fornecedores"
import { alterarGrade, gerarGrade, listarGrade } from "./grade"
import type { ContextoEscrita } from "./repository"
import {
  criarFornecedorSchema,
  editarFornecedorSchema,
  gerarGradeSchema,
  idRota,
  paginaSchema,
  situacaoVariacaoSchema,
} from "./schema"

type Params = { id: string; idVariacao?: string; idVinculo?: string }
type Rota = { params: Promise<Params> }
type Operacao = (
  ctx: ContextoEscrita,
  params: Params,
  request: Request,
  body: unknown,
) => Promise<unknown>

function rota(
  action: Action,
  operacao: Operacao,
  {
    status = 200,
    consulta,
  }: {
    status?: number
    consulta?: "grade" | "vinculos" | "opcoes" | "detalhe"
  } = {},
) {
  const leitura = action === "pode_ler"
  return (req: Request, { params }: Rota) =>
    catalogRequest(
      req,
      "PRODUTOS",
      action,
      async (_companies, actor, body) => {
        const empresa = req.headers.get("X-Empresa-Id")
        if (empresa === null)
          throw new ValidationError(
            "Selecione a empresa ativa em X-Empresa-Id.",
          )
        const path = await params
        const ctx = {
          idEmpresa: validate(idRota, empresa),
          idProduto: validate(idRota, path.id),
          idUsuario: actor.idUsuario,
          token: readBearer(req) ?? "",
        }
        return operacao(ctx, path, req, body)
      },
      status,
      {
        scope: `configuracao-produto:${consulta ?? "write"}`,
        limit: consulta ? (consulta === "detalhe" ? 120 : 360) : 30,
        windowMs: 60_000,
      },
      undefined,
      leitura ? undefined : lerCorpo,
    )
}

function semQuery(req: Request) {
  if (new URL(req.url).search)
    throw new ValidationError(
      "Esta operação não aceita parâmetros de consulta.",
    )
}

async function lerCorpo(req: Request) {
  semQuery(req)
  return readLimitedJson(req)
}

export const listarVariacoesHandler = rota(
  "pode_ler",
  (ctx, _path, req) => listarGrade(ctx, validate(paginaSchema, readQuery(req))),
  { consulta: "grade" },
)

export const gerarVariacoesHandler = rota(
  "pode_criar",
  (ctx, _path, _req, body) =>
    gerarGrade(ctx, validate(gerarGradeSchema, body).variacoes),
  { status: 201 },
)

export const editarVariacaoHandler = rota(
  "pode_editar",
  (ctx, path, _req, body) =>
    alterarGrade(
      ctx,
      validate(idRota, path.idVariacao),
      validate(situacaoVariacaoSchema, body).status,
    ),
)

export const listarFornecedoresHandler = rota(
  "pode_ler",
  (ctx, _path, req) =>
    listarFornecedores(ctx, validate(paginaSchema, readQuery(req))),
  { consulta: "vinculos" },
)

export const opcoesFornecedoresHandler = rota(
  "pode_ler",
  (ctx, _path, req) =>
    listarOpcoes(ctx, validate(paginaSchema, readQuery(req))),
  { consulta: "opcoes" },
)

export const consultarFornecedorHandler = rota(
  "pode_ler",
  (ctx, path, req) => {
    semQuery(req)
    return consultarFornecedor(ctx, validate(idRota, path.idVinculo))
  },
  { consulta: "detalhe" },
)

export const criarFornecedorHandler = rota(
  "pode_criar",
  (ctx, _path, _req, body) =>
    criarFornecedor(ctx, validate(criarFornecedorSchema, body)),
  { status: 201 },
)

export const editarFornecedorHandler = rota(
  "pode_editar",
  (ctx, path, _req, body) =>
    editarFornecedor(
      ctx,
      validate(idRota, path.idVinculo),
      validate(editarFornecedorSchema, body),
    ),
)
