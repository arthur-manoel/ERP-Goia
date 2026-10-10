import "server-only"
import { hashPassword } from "@/lib/password"
import { resolveUserRole } from "../auth/auth.role"
import * as repository from "./usuarios.repository"
import type { CriarUsuarioInput } from "./usuarios.schema"

export async function cadastrarFuncionario(
  ctx: repository.Contexto,
  input: CriarUsuarioInput,
) {
  // Não manter locks durante o cálculo do hash Argon2id.
  const senhaHash = await hashPassword(input.password)
  return repository.gravacao(ctx, async (tx) => {
    const cargo = await repository.buscarCargo(tx, ctx, input.idCargo)
    const setor = await repository.buscarSetor(tx, ctx, input.idSetor)
    const perfil = resolveUserRole({
      nivel_acesso: "USUARIO",
      usuario_empresa: [
        {
          status: "ATIVO",
          empresas: { status: "ATIVA" },
          cargos: cargo,
          setores: setor,
        },
      ],
    })
    if (!perfil)
      throw new repository.UsuarioError(
        422,
        "O cargo e o setor precisam definir um único perfil válido para login: Administração, Produção, Vendas ou Financeiro.",
      )
    await repository.garantirEmailDisponivel(tx, input.email)
    const usuario = await repository.criarFuncionario(tx, ctx, input, senhaHash)
    await repository.auditar(tx, ctx, usuario)
    return { usuario, perfil }
  })
}
