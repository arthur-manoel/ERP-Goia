import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { expect, it } from "vitest"
import ts from "typescript"

function arquivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? arquivos(join(dir, entry.name))
      : [join(dir, entry.name)],
  )
}

it("toda rota e método de API possui uma política no inventário", () => {
  const methods = new Set([
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
  ])
  const document = readFileSync("docs/PERMISSOES-API.md", "utf8")
  const inventory = [
    ...document.matchAll(/^\| `([^`]+)` \| ([^|]+) \| ([^|]+) \|$/gm),
  ].map(([, path, methods, policy]) => ({
    path,
    methods: methods
      .split(",")
      .map((m) => m.trim())
      .sort(),
    policy: policy.trim(),
  }))
  const routes = arquivos("src/app/api")
    .filter((file) => file.endsWith("route.ts"))
    .map((file) => {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      )
      const exports: string[] = []
      for (const statement of source.statements) {
        if (
          ts.isExportDeclaration(statement) &&
          statement.exportClause &&
          ts.isNamedExports(statement.exportClause)
        ) {
          for (const element of statement.exportClause.elements)
            if (methods.has(element.name.text)) exports.push(element.name.text)
        }
        if (
          !ts.canHaveModifiers(statement) ||
          !ts
            .getModifiers(statement)
            ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        )
          continue
        if (
          ts.isFunctionDeclaration(statement) &&
          statement.name &&
          methods.has(statement.name.text)
        )
          exports.push(statement.name.text)
        if (ts.isVariableStatement(statement))
          for (const declaration of statement.declarationList.declarations) {
            if (
              ts.isIdentifier(declaration.name) &&
              methods.has(declaration.name.text)
            )
              exports.push(declaration.name.text)
          }
      }
      return {
        path:
          "/" +
          relative("src/app", file)
            .replaceAll("\\", "/")
            .replace(/\/route\.ts$/, ""),
        methods: exports.sort(),
      }
    })
  expect(
    inventory
      .map(({ path, methods }) => ({ path, methods }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  ).toEqual(routes.sort((a, b) => a.path.localeCompare(b.path)))
  for (const row of inventory) expect(row.policy.length).toBeGreaterThan(10)
})
