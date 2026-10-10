import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { once } from "node:events"

// Sobe o Next real e chama as URLs via fetch; nenhuma camada da API é substituída.
export async function testarApi(
  t,
  { prisma, empresas, produtos, tipos, setores, authorization, marker },
) {
  const probe = createServer()
  probe.listen(0, "127.0.0.1")
  await once(probe, "listening")
  const port = probe.address().port
  await new Promise((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  )
  const server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "development",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
  const stopped = once(server, "exit")
  let output = ""
  const collect = (chunk) => {
    output = (output + chunk.toString()).slice(-8000)
  }
  server.stdout.on("data", collect)
  server.stderr.on("data", collect)
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => done(new Error(`Next não iniciou em 60s.\n${output}`)),
        60000,
      )
      function check() {
        if (/Ready in/.test(output)) done()
      }
      function exited() {
        done(new Error(`Next encerrou antes de iniciar.\n${output}`))
      }
      function done(error) {
        clearTimeout(timeout)
        server.stdout.off("data", check)
        server.stderr.off("data", check)
        server.off("exit", exited)
        server.off("error", done)
        if (error) reject(error)
        else resolve()
      }
      server.stdout.on("data", check)
      server.stderr.on("data", check)
      server.once("exit", exited)
      server.once("error", done)
      check()
    })
    const base = `http://127.0.0.1:${port}/api/ordens-producao`
    async function call(method, suffix, body, expected, headers = {}) {
      const response = await fetch(base + suffix, {
        method,
        headers: {
          authorization,
          "X-Empresa-Id": String(empresas[0]),
          "Content-Type": "application/json",
          ...headers,
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      })
      const text = await response.text()
      assert.equal(
        response.status,
        expected,
        `${method} ${suffix || "/"}: ${text.slice(0, 1000)}`,
      )
      const result = JSON.parse(text)
      if (expected >= 400) assert.equal(typeof result.error, "string")
      else assert.equal(response.headers.get("cache-control"), "no-store")
      return result
    }
    await t.test(
      "HTTP setores e GET produto/fluxo: 201, 409, 204, sequência e Bearer",
      async () => {
        const api = `http://127.0.0.1:${port}/api`
        const headers = {
          authorization,
          "X-Empresa-Id": String(empresas[0]),
          "Content-Type": "application/json",
        }
        const body = JSON.stringify({ nome: `Setor HTTP ${marker}` })
        const created = await fetch(`${api}/setores`, {
          method: "POST",
          headers,
          body,
        })
        const result = await created.json()
        assert.equal(created.status, 201, JSON.stringify(result))
        assert.ok(result.setor.createdAt)
        const duplicate = await fetch(`${api}/setores`, {
          method: "POST",
          headers,
          body,
        })
        assert.equal(duplicate.status, 409, await duplicate.text())
        const removed = await fetch(`${api}/setores/${result.setor.id}`, {
          method: "DELETE",
          headers,
        })
        assert.equal(removed.status, 204)
        const association = await fetch(
          `${api}/produtos/${produtos[0]}/fluxo`,
          { headers },
        )
        const associated = await association.json()
        assert.equal(association.status, 200, JSON.stringify(associated))
        assert.deepEqual(
          associated.fluxo.setores.map((s) => s.id),
          setores,
        )
        const cookieOnly = await fetch(`${api}/produtos/${produtos[0]}/fluxo`, {
          headers: {
            "X-Empresa-Id": String(empresas[0]),
            Cookie: `accessToken=${authorization.slice(7)}`,
          },
        })
        assert.equal(cookieOnly.status, 401)
      },
    )
    // Duas composições distintas permitem comprovar recálculo por produto e quantidade.
    const material = await prisma.produtos.create({
      data: {
        nome: "Segundo insumo HTTP",
        codigo: `${marker}-http`,
        id_tipo_produto: tipos[0],
      },
    })
    produtos.push(material.id)
    await prisma.produto_empresa.create({
      data: { id_empresa: empresas[0], id_produto: material.id },
    })
    const fichas = []
    for (let index = 0; index < 2; index++) {
      fichas.push(
        await prisma.ficha_tecnica.create({
          data: {
            id_empresa: empresas[0],
            id_produto: produtos[index],
            versao: 2,
            status: "ATIVA",
            ficha_tecnica_item: {
              create: [
                {
                  id_produto_componente: produtos[2],
                  quantidade: index === 0 ? "0.125" : "0.5",
                  perda_percentual: "25",
                },
                {
                  id_produto_componente: material.id,
                  quantidade: index === 0 ? "2" : "1",
                  perda_percentual: "10",
                },
              ],
            },
          },
        }),
      )
    }
    const totals = (result) =>
      Object.fromEntries(
        result.ordem.ordem_producao_item[0].ordem_producao_consumo_planejado.map(
          (item) => [item.id_materia_prima, item.quantidade_necessaria],
        ),
      )
    let id
    let etapas
    await t.test(
      "HTTP abertura: 201, produto vinculado e dois insumos previstos sem perdas",
      async () => {
        const result = await call(
          "POST",
          "",
          { idProduto: produtos[0], quantidade: "3" },
          201,
        )
        id = result.ordem.id
        etapas = result.etapas
        assert.deepEqual(
          etapas.map((e) => e.id_setor),
          setores,
        )
        assert.equal(result.ordem.status, "PLANEJADA")
        assert.equal(
          result.ordem.ordem_producao_item[0].id_produto,
          produtos[0],
        )
        assert.equal(result.perdaAplicada, false)
        assert.deepEqual(totals(result), {
          [produtos[2]]: "0.375",
          [material.id]: "6",
        })
        const stored = await prisma.ordem_producao_consumo_planejado.findMany({
          where: { id_ordem_producao: id },
        })
        assert.equal(stored.length, 2)
        assert.deepEqual(
          Object.fromEntries(
            stored.map((row) => [
              row.id_materia_prima,
              row.quantidade_necessaria.toString(),
            ]),
          ),
          totals(result),
        )
      },
    )
    assert.ok(
      id,
      "A abertura precisa funcionar para testar o restante do ciclo",
    )
    await t.test(
      "HTTP alteração: recálculo por quantidade e bloqueio de troca de produto",
      async () => {
        const quantity = await call(
          "PATCH",
          `/${id}`,
          { statusEsperado: "PLANEJADA", quantidade: "4" },
          200,
        )
        assert.deepEqual(totals(quantity), {
          [produtos[2]]: "0.5",
          [material.id]: "8",
        })
        await call(
          "PATCH",
          `/${id}`,
          {
            statusEsperado: "PLANEJADA",
            idProduto: produtos[1],
            observacao: "Troca de produto",
          },
          409,
        )
      },
    )
    await t.test(
      "HTTP validações: JSON/quantidade inválidos, autenticação, vínculo e ID inexistente",
      async () => {
        await call("POST", "", "{", 400)
        await call("POST", "", { idProduto: produtos[0], quantidade: "0" }, 400)
        await call(
          "POST",
          "",
          { idProduto: produtos[0], quantidade: "1" },
          401,
          { authorization: "" },
        )
        await call(
          "PATCH",
          `/${id}`,
          { statusEsperado: "PLANEJADA", observacao: "Inválida" },
          403,
          { "X-Empresa-Id": String(empresas[1]) },
        )
        await call(
          "PATCH",
          "/2147483647",
          { statusEsperado: "PLANEJADA", observacao: "Inexistente" },
          404,
        )
        await call(
          "POST",
          `/${id}/avancar`,
          {
            statusEsperado: "PLANEJADA",
            setorEsperado: null,
            statusDestino: "EM_PRODUCAO",
          },
          409,
        )
      },
    )
    await t.test(
      "HTTP avanço: liberação, início e composição travada; observação não recalcula",
      async () => {
        const released = await call(
          "POST",
          `/${id}/avancar`,
          {
            statusEsperado: "PLANEJADA",
            setorEsperado: null,
            statusDestino: "LIBERADA",
          },
          200,
        )
        assert.equal(released.ordem.status, "LIBERADA")
        await call(
          "PATCH",
          `/${id}`,
          { statusEsperado: "LIBERADA", quantidade: "8" },
          409,
        )
        const started = await call(
          "POST",
          `/${id}/etapas/iniciar`,
          { etapaId: etapas[0].id },
          200,
        )
        assert.equal(started.ordem.id_setor, setores[0])
        assert.ok(started.ordem.data_inicio)
        await call(
          "PATCH",
          `/${id}`,
          { statusEsperado: "EM_PRODUCAO", idProduto: produtos[0] },
          409,
        )
        await call(
          "PATCH",
          `/${id}`,
          { statusEsperado: "EM_PRODUCAO", quantidade: "9" },
          409,
        )
        await prisma.ficha_tecnica_item.updateMany({
          where: { id_ficha_tecnica: fichas[0].id },
          data: { quantidade: "99" },
        })
        const note = await call(
          "PATCH",
          `/${id}`,
          { statusEsperado: "EM_PRODUCAO", observacao: "Somente observação" },
          200,
        )
        assert.deepEqual(totals(note), {
          [produtos[2]]: "0.5",
          [material.id]: "8",
        })
        await call(
          "POST",
          `/${id}/encerrar`,
          { statusEsperado: "EM_PRODUCAO", setorEsperado: setores[0] },
          409,
        )
      },
    )
    await t.test(
      "HTTP avanços concorrentes: um 200 e um 409, sem pular setor",
      async () => {
        const responses = await Promise.all(
          Array.from({ length: 2 }, () =>
            fetch(`${base}/${id}/etapas/concluir`, {
              method: "POST",
              headers: {
                authorization,
                "X-Empresa-Id": String(empresas[0]),
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                etapaId: etapas[0].id,
              }),
              signal: AbortSignal.timeout(60000),
            }),
          ),
        )
        assert.deepEqual(
          responses.map((response) => response.status).sort(),
          [200, 409],
        )
        await Promise.all(responses.map((response) => response.json()))
        const stored = await prisma.ordem_producao.findUniqueOrThrow({
          where: { id },
        })
        assert.equal(stored.id_setor, setores[0])
        assert.equal(
          await prisma.ordem_producao_movimentacao_setor.count({
            where: { id_ordem_producao: id },
          }),
          1,
        )
      },
    )
    await t.test(
      "HTTP encerramento: bloqueia pendência e conclui sem baixar estoque",
      async () => {
        await call(
          "POST",
          `/${id}/etapas/iniciar`,
          { etapaId: etapas[1].id },
          200,
        )
        await call(
          "POST",
          `/${id}/etapas/concluir`,
          { etapaId: etapas[1].id },
          200,
        )
        await call(
          "POST",
          `/${id}/etapas/iniciar`,
          { etapaId: etapas[2].id },
          200,
        )
        const movement =
          await prisma.ordem_producao_movimentacao_setor.findFirstOrThrow({
            where: { id_ordem_producao: id, id_setor_destino: setores[2] },
          })
        await prisma.ordem_producao_movimentacao_setor.update({
          where: { id: movement.id },
          data: { status: "EM_TRANSITO" },
        })
        await call(
          "POST",
          `/${id}/etapas/concluir`,
          { etapaId: etapas[2].id },
          409,
        )
        await prisma.ordem_producao_movimentacao_setor.update({
          where: { id: movement.id },
          data: { status: "ENTREGUE" },
        })
        const closed = await call(
          "POST",
          `/${id}/etapas/concluir`,
          { etapaId: etapas[2].id },
          200,
        )
        assert.equal(closed.ordem.status, "CONCLUIDA")
        assert.ok(closed.ordem.data_conclusao)
        assert.equal(
          closed.ordem.ordem_producao_item[0].quantidade_produzida,
          "4",
        )
        assert.equal(closed.baixaEstoque, "pendente")
        assert.equal(closed.perdaAplicada, false)
        assert.deepEqual(totals(closed), {
          [produtos[2]]: "0.5",
          [material.id]: "8",
        })
        assert.equal(
          (await prisma.ordem_producao.findUniqueOrThrow({ where: { id } }))
            .status,
          "CONCLUIDA",
        )
        assert.equal(
          await prisma.consumo_producao.count({
            where: { id_ordem_producao: id },
          }),
          0,
        )
        assert.equal(
          await prisma.movimentacao_estoque.count({
            where: { id_empresa: empresas[0] },
          }),
          0,
        )
        await call(
          "POST",
          `/${id}/etapas/concluir`,
          { etapaId: etapas[2].id },
          409,
        )
        await call(
          "PATCH",
          `/${id}`,
          { statusEsperado: "CONCLUIDA", observacao: "Não permitido" },
          409,
        )
      },
    )
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      server.kill("SIGTERM")
      const timeout = setTimeout(() => server.kill("SIGKILL"), 10000)
      try {
        await stopped
      } finally {
        clearTimeout(timeout)
      }
    }
  }
}
