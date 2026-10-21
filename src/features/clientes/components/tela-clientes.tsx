import { TelaModulo } from "@/features/erp/components/tela-modulo"

export function TelaClientes() {
  return <TelaModulo module="comercial" initialTab="clients" />
}

export function TelaFornecedores() {
  return <TelaModulo module="comercial" initialTab="suppliers" />
}
