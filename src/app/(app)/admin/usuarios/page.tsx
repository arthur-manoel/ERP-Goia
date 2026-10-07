import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Usuários" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Usuários"
        descricao="Usuários, vínculo com empresas e permissões."
      />
      <EmConstrucao
        tabelas={[
          "usuarios",
          "usuario_empresa",
          "permissoes_usuario",
          "administradores_gerais",
        ]}
      />
    </>
  )
}
