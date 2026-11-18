"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  CampoSelecao,
  CampoTexto,
  CampoTextarea,
} from "@/components/formulario/campos"
import { FormularioDialogo } from "@/components/formulario/formulario-dialogo"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { montarAlteracoes } from "../alteracoes"
import { criarSetor, editarSetor } from "../api"
import { formularioSetorSchema } from "../formulario-schema"
import {
  TIPO_PADRAO,
  type SetorApi,
  type TipoSetor,
  type ValoresSetor,
} from "../tipos"

export function FormularioSetor({
  setor,
  idEmpresa,
  tipos,
  onClose,
  onSaved,
}: {
  /** null = cadastro; um setor = edição (inclusive de setor inativo). */
  setor: SetorApi | null
  idEmpresa: number
  tipos: TipoSetor[]
  onClose: () => void
  onSaved: () => void
}) {
  const { requisitar } = useAutenticacao()
  // Tipos ativos reais + o padrão + o valor atual do setor (pode ser antigo
  // ou de um tipo depois inativado: continua selecionável para não forçar troca).
  const nomes = new Set<string>([TIPO_PADRAO])
  for (const tipo of tipos) if (tipo.ativo) nomes.add(tipo.nome)
  if (setor) nomes.add(setor.tipo)

  return (
    <FormularioDialogo<ValoresSetor, ValoresSetor>
      titulo={setor ? "Editar setor" : "Novo setor"}
      descricao="Setor é o local ou etapa onde uma atividade de produção acontece (ex.: Corte, Costura, Acabamento)."
      valoresIniciais={{
        nome: setor?.nome ?? "",
        tipo: setor?.tipo ?? TIPO_PADRAO,
        descricao: setor?.descricao ?? "",
      }}
      resolver={zodResolver(formularioSetorSchema)}
      aoEnviar={async (valores) => {
        if (setor) {
          // Só os campos alterados: nunca reenvia `ativo`.
          const alteracoes = montarAlteracoes(setor, valores)
          if (Object.keys(alteracoes).length)
            await editarSetor(requisitar, idEmpresa, setor, alteracoes)
        } else await criarSetor(requisitar, idEmpresa, valores)
        onSaved()
      }}
      aoFechar={onClose}
      rotuloSalvar={setor ? "Salvar alterações" : "Cadastrar setor"}
      mensagemSucesso={setor ? "Setor atualizado." : "Setor cadastrado."}
    >
      {(form) => (
        <>
          <CampoTexto
            form={form}
            nome="nome"
            rotulo="Nome *"
            placeholder="Ex.: Corte"
          />
          <CampoSelecao
            form={form}
            nome="tipo"
            rotulo="Tipo *"
            ajuda="Tipos cadastrados pela administração da empresa."
            opcoes={[...nomes].map((nome) => ({ valor: nome, rotulo: nome }))}
          />
          <CampoTextarea
            form={form}
            nome="descricao"
            rotulo="Descrição (opcional)"
            placeholder="Detalhes da atividade realizada neste setor."
          />
        </>
      )}
    </FormularioDialogo>
  )
}
