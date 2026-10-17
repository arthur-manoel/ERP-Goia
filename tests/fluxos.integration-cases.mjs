import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

// Executado pela suíte de produção em um banco já migrado, sem mocks nem DDL.
export async function testarFluxos(
  t,
  { prisma, ctx, authorization, setores, produtos, empresas },
) {
  const { handler } = await import("../src/modules/fluxos/router.ts")
  const service = await import("../src/modules/fluxos/fluxos.service.ts")
  const repo = await import("../src/modules/producao/producao.repository.ts")
  const marker = randomUUID().slice(0, 8)
  const call = async (
    tipo,
    operacao,
    id,
    body,
    expected,
    extraHeaders = {},
  ) => {
    const method =
      operacao === "criar"
        ? "POST"
        : operacao === "editar"
          ? "PATCH"
          : operacao === "excluir" || operacao === "desassociar"
            ? "DELETE"
            : operacao === "associar"
              ? "PUT"
              : "GET"
    const response = await handler(tipo, operacao)(
      new Request("http://localhost/api/teste", {
        method,
        headers: {
          authorization,
          "X-Empresa-Id": String(ctx.idEmpresa),
          "Content-Type": "application/json",
          ...extraHeaders,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      id === undefined
        ? undefined
        : { params: Promise.resolve({ id: String(id) }) },
    )
    const result = response.status === 204 ? null : await response.json()
    assert.equal(response.status, expected, JSON.stringify(result))
    return result
  }
  let setorId, fluxoId
  await t.test(
    "setor: POST com datas, duplicidade 409 e auditoria de INSERT/UPDATE/DELETE",
    async () => {
      const created = await call(
        "setor",
        "criar",
        undefined,
        { nome: `Corte ${marker}` },
        201,
      )
      setorId = created.setor.id
      assert.ok(created.setor.createdAt)
      assert.ok(created.setor.updatedAt)
      await call("setor", "criar", undefined, { nome: `Corte ${marker}` }, 409)
      await call(
        "setor",
        "editar",
        setorId,
        { descricao: "Teste de auditoria" },
        200,
      )
      const audit = await prisma.auditoria.findMany({
        where: { tabela: "setores", id_registro: setorId },
        orderBy: { id: "asc" },
      })
      assert.deepEqual(
        audit.map((a) => a.acao),
        ["INSERT", "UPDATE"],
      )
      assert.ok(
        audit.every(
          (a) =>
            a.id_empresa === ctx.idEmpresa && a.id_usuario === ctx.idUsuario,
        ),
      )
      assert.equal(JSON.parse(audit[1].dados_anteriores).descricao, null)
      assert.equal(
        JSON.parse(audit[1].dados_novos).descricao,
        "Teste de auditoria",
      )
    },
  )
  await t.test(
    "fluxo: lista ordenada, duplicate 409, setor vinculado 409 e auditoria da sequência",
    async () => {
      const created = await call(
        "fluxo",
        "criar",
        undefined,
        { nome: `Fluxo ${marker}`, setores: [setorId, setores[0]] },
        201,
      )
      fluxoId = created.fluxo.id
      await call(
        "fluxo",
        "criar",
        undefined,
        { nome: `Fluxo ${marker}`, setores: [setorId] },
        409,
      )
      await call("setor", "excluir", setorId, undefined, 409)
      const changed = await call(
        "fluxo",
        "editar",
        fluxoId,
        { setores: [setores[0], setorId] },
        200,
      )
      assert.deepEqual(
        changed.fluxo.setores.map((s) => s.id),
        [setores[0], setorId],
      )
      const audit = await prisma.auditoria.findFirstOrThrow({
        where: {
          tabela: "fluxos_producao",
          id_registro: fluxoId,
          acao: "UPDATE",
        },
      })
      assert.deepEqual(
        JSON.parse(audit.dados_anteriores).setores.map((s) => s.id),
        [setorId, setores[0]],
      )
      assert.deepEqual(
        JSON.parse(audit.dados_novos).setores.map((s) => s.id),
        [setores[0], setorId],
      )
    },
  )
  await t.test(
    "GET associação: nulo, associado ordenado, isolamento e Bearer obrigatório",
    async () => {
      const idProduto = produtos[0]
      assert.deepEqual(
        await call("fluxo", "consultarAssociacao", idProduto, undefined, 200),
        { produto: { id: idProduto, fluxoId: null }, fluxo: null },
      )
      await call("fluxo", "associar", idProduto, { fluxoId }, 200)
      const associated = await call(
        "fluxo",
        "consultarAssociacao",
        idProduto,
        undefined,
        200,
      )
      assert.equal(associated.produto.fluxoId, fluxoId)
      assert.deepEqual(
        associated.fluxo.setores.map((s) => s.id),
        [setores[0], setorId],
      )
      await call("fluxo", "consultarAssociacao", idProduto, undefined, 401, {
        authorization: "",
        Cookie: `accessToken=${authorization.slice(7)}`,
      })
      await call("fluxo", "consultarAssociacao", idProduto, undefined, 403, {
        "X-Empresa-Id": String(empresas[1]),
      })
      await assert.rejects(
        service.consultarAssociacao(
          { ...ctx, idEmpresa: empresas[1] },
          idProduto,
        ),
        (e) => e.status === 404,
      )
      await call("fluxo", "consultarAssociacao", 2147483647, undefined, 404)
      await call("fluxo", "desassociar", idProduto, undefined, 204)
      await call("fluxo", "associar", idProduto, { fluxoId }, 200)
      const pe = await prisma.produto_empresa.findUniqueOrThrow({
        where: {
          id_empresa_id_produto: {
            id_empresa: ctx.idEmpresa,
            id_produto: idProduto,
          },
        },
      })
      const audit = await prisma.auditoria.findMany({
        where: { tabela: "produto_fluxo", id_registro: pe.id },
        orderBy: { id: "asc" },
      })
      assert.deepEqual(
        audit.map((a) => a.acao),
        ["INSERT", "DELETE", "INSERT"],
      )
      assert.equal(JSON.parse(audit[1].dados_anteriores).fluxoId, fluxoId)
      assert.equal(audit[1].dados_novos, null)
    },
  )
  await t.test(
    "falha real de auditoria reverte setor, fluxo, sequência e associação",
    async () => {
      const invalido = { ...ctx, idUsuario: 2147483647 }
      await assert.rejects(
        service.salvar(invalido, "setor", { nome: `Reverter ${marker}` }),
        (e) => e.status === 409,
      )
      assert.equal(
        await prisma.setores.count({
          where: { id_empresa: ctx.idEmpresa, nome: `Reverter ${marker}` },
        }),
        0,
      )
      await assert.rejects(
        service.salvar(
          invalido,
          "fluxo",
          { nome: "Não gravar", setores: [setorId] },
          fluxoId,
        ),
        (e) => e.status === 409,
      )
      const flow = await service.consultar(ctx, "fluxo", fluxoId)
      assert.equal(flow.fluxo.nome, `Fluxo ${marker}`)
      assert.deepEqual(
        flow.fluxo.setores.map((s) => s.id),
        [setores[0], setorId],
      )
      await assert.rejects(
        service.associar(invalido, produtos[0], null),
        (e) => e.status === 409,
      )
      assert.equal(
        (await service.consultarAssociacao(ctx, produtos[0])).produto.fluxoId,
        fluxoId,
      )
      await assert.rejects(
        service.excluir(invalido, "fluxo", fluxoId),
        (e) => e.status === 409,
      )
      assert.equal(
        (await service.consultarAssociacao(ctx, produtos[0])).produto.fluxoId,
        fluxoId,
      )
    },
  )
  await t.test(
    "adapter real: FK de SQL raw retorna 409 e falha de schema não vira conflito",
    async () => {
      await assert.rejects(
        repo.transacao(
          (tx) =>
            tx.$executeRaw`INSERT INTO fluxo_producao_setor (id_fluxo, id_setor, ordem) VALUES (${fluxoId}, ${2147483647}, 3)`,
        ),
        (e) => e.status === 409,
      )
      await assert.rejects(
        repo.transacao(
          (tx) =>
            tx.$queryRaw`SELECT coluna_que_nao_existe FROM setores LIMIT 1`,
        ),
        (e) => e.status !== 409,
      )
    },
  )
  await t.test(
    "exclusão audita associações removidas por cascade e mantém DELETE dos cadastros",
    async () => {
      await call("fluxo", "excluir", fluxoId, undefined, 204)
      assert.equal(
        (
          await call(
            "fluxo",
            "consultarAssociacao",
            produtos[0],
            undefined,
            200,
          )
        ).fluxo,
        null,
      )
      await call("setor", "excluir", setorId, undefined, 204)
      for (const [tabela, id] of [
        ["setores", setorId],
        ["fluxos_producao", fluxoId],
      ]) {
        const audit = await prisma.auditoria.findFirstOrThrow({
          where: { tabela, id_registro: id, acao: "DELETE" },
        })
        assert.ok(audit.dados_anteriores)
        assert.equal(audit.dados_novos, null)
      }
      const pe = await prisma.produto_empresa.findUniqueOrThrow({
        where: {
          id_empresa_id_produto: {
            id_empresa: ctx.idEmpresa,
            id_produto: produtos[0],
          },
        },
      })
      assert.equal(
        await prisma.auditoria.count({
          where: {
            tabela: "produto_fluxo",
            id_registro: pe.id,
            acao: "DELETE",
          },
        }),
        2,
      )
    },
  )
}
