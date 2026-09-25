import { PageHeader } from "@/components/layout/page-header"
import { FormularioProduto } from "./formulario-produto"
import { ListaProdutos } from "./lista-produtos"

export function TelaProdutos() {
  return (
    <>
      <PageHeader
        titulo="Produtos"
        descricao="Consulte os produtos cadastrados e suas informações de estoque."
        acoes={<FormularioProduto />}
      />
      <ListaProdutos />
    </>
  )
}
