import { TelaModulo } from "@/features/erp/components/tela-modulo"
import { ClientesApiView } from "./clientes-api-view"

export function TelaClientes() {
  return <ClientesApiView />
}

export function TelaFornecedores() {
  return <TelaModulo module="comercial" initialTab="suppliers" />
}
