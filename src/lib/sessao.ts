import "server-only"

export type Sessao = {
  idUsuario: number
  idEmpresa: number
}

function idDoAmbiente(nome: string) {
  const valor = Number(process.env[nome])
  if (!Number.isInteger(valor) || valor <= 0) {
    throw new Error(
      `Defina ${nome} no .env.local com um id existente no banco (veja o .env.example).`,
    )
  }
  return valor
}

/**
 * Usuário e empresa da sessão atual.
 *
 * PROVISÓRIO: enquanto a autenticação não existe, lê DEV_ID_USUARIO e DEV_ID_EMPRESA
 * do .env.local. As issues de autenticação e multiempresa trocam a implementação
 * mantendo esta assinatura, então os módulos já podem usá-la.
 */
export async function getSessao(): Promise<Sessao> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("A sessão provisória não pode ser usada em produção.")
  }
  return {
    idUsuario: idDoAmbiente("DEV_ID_USUARIO"),
    idEmpresa: idDoAmbiente("DEV_ID_EMPRESA"),
  }
}

/** Atalho para consultas que só precisam da empresa. */
export async function getEmpresaAtual() {
  const { idEmpresa } = await getSessao()
  return { idEmpresa }
}
