import { randomUUID } from "node:crypto"

// Chamado somente pelas suítes, depois de validar host local e banco _test.
export async function criarCenarioEmpresas(prisma) {
  const { hashPassword } =
    await import("../../src/modules/auth/auth.service.ts")
  const marker = randomUUID().slice(0, 8)
  const password = "AuthEmpresas#2026"
  const hash = await hashPassword(password)
  return prisma.$transaction(
    async (tx) => {
      const empresas = []
      for (const [i, nome] of [
        "Vendas local",
        "Financeiro local",
        "Multi A",
        "Multi B",
        "Inativa",
        "Alheia",
      ].entries()) {
        empresas.push(
          await tx.empresas.create({
            data: {
              razao_social: `${nome} ${marker}`,
              cnpj: String(Date.now() + i),
              ...(i === 4 ? { status: "INATIVA" } : {}),
            },
          }),
        )
      }
      const usuarios = {}
      const vinculos = []
      async function user(key, perfil, indices, recursos = []) {
        const u = await tx.usuarios.create({
          data: {
            nome: `${perfil} ${marker}`,
            email: `${key}-${marker}@auth-empresas.example.test`,
            senha: hash,
            ...(key === "semVinculos" ? { nivel_acesso: "ADMIN" } : {}),
          },
        })
        for (const index of indices) {
          const cargo = await tx.cargos.upsert({
            where: {
              id_empresa_nome: { id_empresa: empresas[index].id, nome: perfil },
            },
            create: { id_empresa: empresas[index].id, nome: perfil },
            update: {},
          })
          const v = await tx.usuario_empresa.create({
            data: {
              id_usuario: u.id,
              id_empresa: empresas[index].id,
              id_cargo: cargo.id,
            },
          })
          vinculos.push(v.id)
          for (const recurso of recursos)
            await tx.permissoes_usuario.create({
              data: { id_usuario_empresa: v.id, recurso, pode_ler: true },
            })
        }
        usuarios[key] = {
          ...u,
          password,
          empresas: indices
            .filter((i) => i !== 4)
            .map((i) => ({
              id: empresas[i].id,
              nome: empresas[i].razao_social,
            })),
        }
      }
      await user("vendas", "VENDAS", [0, 4], ["CLIENTES"])
      await user("financeiro", "FINANCEIRO", [1], ["FINANCEIRO"])
      await user("multi", "VENDAS", [2, 3], ["CLIENTES"])
      await user("semVinculos", "ADMINISTRACAO", [])
      await user("semPermissoes", "VENDAS", [0])
      await user("estoque", "ADMINISTRACAO", [0], ["ESTOQUE"])
      // Vínculo inativo, separado da empresa inativa já presente no perfil de vendas.
      const cargo = await tx.cargos.create({
        data: { id_empresa: empresas[5].id, nome: "VENDAS" },
      })
      const inativo = await tx.usuario_empresa.create({
        data: {
          id_empresa: empresas[5].id,
          id_usuario: usuarios.vendas.id,
          id_cargo: cargo.id,
          status: "INATIVO",
        },
      })
      vinculos.push(inativo.id)
      return { usuarios, empresas, vinculos, marker }
    },
    { timeout: 15000 },
  )
}
export async function removerCenarioEmpresas(prisma, cenario) {
  const ids = Object.values(cenario.usuarios).map((u) => u.id),
    empresas = cenario.empresas.map((e) => e.id)
  await prisma.refresh_tokens.deleteMany({ where: { id_usuario: { in: ids } } })
  await prisma.permissoes_usuario.deleteMany({
    where: { id_usuario_empresa: { in: cenario.vinculos } },
  })
  await prisma.usuario_empresa.deleteMany({
    where: { id: { in: cenario.vinculos } },
  })
  await prisma.cargos.deleteMany({ where: { id_empresa: { in: empresas } } })
  await prisma.usuarios.deleteMany({ where: { id: { in: ids } } })
  await prisma.empresas.deleteMany({ where: { id: { in: empresas } } })
}
