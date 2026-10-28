import { expect, it } from "vitest"
import * as repository from "../../../modules/categorias/repository"
import { db } from "../../helpers/prisma"

it("adquire bloqueios de empresa antes de ler e gravar na transação", async () => {
  db.$queryRaw.mockResolvedValue([])
  db.categorias.create.mockResolvedValue({ id: 1 })
  await repository.withCompaniesLock([20, 10], (database) =>
    repository.create(
      { id_empresa: 10, nome: "Tecidos", descricao: null, status: "ATIVA" },
      database,
    ),
  )
  const [strings, first, second] = db.$queryRaw.mock.calls[0]
  expect(strings.join("?")).toContain("ORDER BY id FOR UPDATE")
  expect(first.values).toEqual([10, 20])
  expect(second).toBeUndefined()
  expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
    db.categorias.create.mock.invocationCallOrder[0],
  )
})

it("parametriza o nome e restringe duplicidade à empresa, status ativo e outro ID", async () => {
  db.$queryRaw.mockResolvedValue([{ id: 3 }])
  const name = "x' OR 1=1 --"
  expect(await repository.findByName(name, 10, 1)).toEqual({ id: 3 })
  const sql = db.$queryRaw.mock.calls[0][0]
  expect(sql.sql).toContain("status = 'ATIVA'")
  expect(sql.sql).toContain("LOWER(TRIM(REGEXP_REPLACE")
  expect(sql.sql).toContain("LIMIT 1")
  expect(sql.sql).not.toContain(name)
  expect(sql.values).toEqual([10, name, 1])
})

it("mantém os filtros de empresa na contagem isolada", async () => {
  db.categorias.count.mockResolvedValue(3)
  expect(
    await repository.count(
      { ordenar_por: "nome", ordem: "asc", id_empresa: 99 },
      [10],
    ),
  ).toBe(3)
  expect(db.categorias.count).toHaveBeenCalledWith({
    where: { AND: [{ id_empresa: { in: [10] } }, { id_empresa: 99 }] },
  })
})
