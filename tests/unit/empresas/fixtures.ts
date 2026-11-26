import type { ApiEmpresas } from "@/features/empresas/api"

async function naoConfigurado(): Promise<never> {
  throw new Error("Método não configurado pelo teste.")
}
export const apiEmpresasTeste: ApiEmpresas = {
  listar: naoConfigurado,
  consultar: naoConfigurado,
  criar: naoConfigurado,
  editar: naoConfigurado,
  inativar: naoConfigurado,
  ativar: naoConfigurado,
}
