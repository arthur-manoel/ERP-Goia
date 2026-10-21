import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { registerHooks } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { createServer } from "node:net"
import path from "node:path"
import ts from "typescript"

export function bancoLocal(value) {
  assert.ok(
    value,
    "Configure a URL de teste; ausência de banco não é aprovação.",
  )
  const url = new URL(value)
  assert.equal(url.protocol, "mysql:")
  assert.ok(
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
    "Use somente banco local.",
  )
  assert.match(
    url.pathname,
    /^\/[A-Za-z0-9_]+_test$/,
    "Use banco dedicado com sufixo _test.",
  )
  return url
}
export function typescript() {
  return registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "server-only")
        return { url: "data:text/javascript,export {};", shortCircuit: true }
      const base = specifier.startsWith("@/")
        ? pathToFileURL(path.resolve("src", specifier.slice(2))).href
        : specifier.startsWith(".")
          ? new URL(specifier, context.parentURL).href
          : null
      if (base?.startsWith("file:") && existsSync(fileURLToPath(base + ".ts")))
        return { url: base + ".ts", shortCircuit: true }
      return next(specifier, context)
    },
    load(url, context, next) {
      if (url.startsWith("file:") && url.endsWith(".ts"))
        return {
          format: "module",
          shortCircuit: true,
          source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
            compilerOptions: {
              module: ts.ModuleKind.ESNext,
              target: ts.ScriptTarget.ES2022,
            },
          }).outputText,
        }
      return next(url, context)
    },
  })
}
export async function httpProducao() {
  assert.ok(
    existsSync(".next/BUILD_ID"),
    "Execute npm run build antes da integração HTTP.",
  )
  const socket = createServer()
  socket.listen(0, "127.0.0.1")
  await once(socket, "listening")
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))
  const server = spawn(
    process.execPath,
    [
      path.resolve("node_modules/next/dist/bin/next"),
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      String(port),
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "production", TZ: "America/Fortaleza" },
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    },
  )
  let erro
  server.stderr.on("data", (chunk) => process.stderr.write(chunk))
  server.on("error", (e) => {
    erro = e
  })
  const base = `http://127.0.0.1:${port}`
  try {
    for (let i = 0; i < 150; i++) {
      if (erro) throw erro
      assert.equal(
        server.exitCode,
        null,
        "Servidor encerrou antes de atender HTTP.",
      )
      try {
        const resposta = await fetch(base + "/api/pedidos", {
          signal: AbortSignal.timeout(2000),
        })
        await resposta.body?.cancel()
        if (resposta.status === 401) return { server, base }
      } catch (e) {
        if (e instanceof assert.AssertionError) throw e
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    throw new Error("Servidor não iniciou dentro do prazo.")
  } catch (e) {
    server.kill()
    throw e
  }
}
