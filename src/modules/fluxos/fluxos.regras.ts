/**
 * Inativar = transição ATIVO → INATIVO. Só ela exige permissão de exclusão.
 * Criar já inativo, reenviar `ativo: false` para quem já está inativo ou não
 * enviar `ativo` não são inativações.
 */
export function ehInativacao(
  statusAnterior: "ATIVO" | "INATIVO" | undefined,
  ativo: boolean | undefined,
) {
  return ativo === false && statusAnterior === "ATIVO"
}
