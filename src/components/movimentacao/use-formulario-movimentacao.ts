"use client"

import { useRef, useState } from "react"
import { prepararMovimentacao } from "@/lib/movimentacao/registro"
import {
  type CamposMovimentacao,
  type CampoComErro,
  type DadosMovimentacao,
  type ErrosMovimentacao,
  type OpcoesMovimentacao,
  type ResumoMovimentacaoDados,
  type TipoMovimentacao,
  usaDestino,
  usaOrigem,
} from "@/lib/movimentacao/tipos"
import { validarMovimentacao } from "@/lib/movimentacao/validacao"

/** editando → confirmando (resumo aberto) → enviando → concluida */
export type FaseMovimentacao =
  "editando" | "confirmando" | "enviando" | "concluida"

const camposIniciais: CamposMovimentacao = {
  item: null,
  idEstoqueOrigem: null,
  idEstoqueDestino: null,
  quantidade: "",
  observacao: "",
}

const erroDoCampo: Record<keyof CamposMovimentacao, CampoComErro> = {
  item: "item",
  idEstoqueOrigem: "origem",
  idEstoqueDestino: "destino",
  quantidade: "quantidade",
  observacao: "observacao",
}

type Preparada = { dados: DadosMovimentacao; resumo: ResumoMovimentacaoDados }

export function useFormularioMovimentacao({ estoques }: OpcoesMovimentacao) {
  const [tipo, setTipo] = useState<TipoMovimentacao>("entrada")
  const [campos, setCampos] = useState<CamposMovimentacao>(camposIniciais)
  const [erros, setErros] = useState<ErrosMovimentacao>({})
  const [fase, setFase] = useState<FaseMovimentacao>("editando")
  const [preparada, setPreparada] = useState<Preparada | null>(null)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)
  // Trava síncrona contra duplo clique: o estado só atualiza na próxima renderização.
  const enviando = useRef(false)

  function atualizarCampo<K extends keyof CamposMovimentacao>(
    campo: K,
    valor: CamposMovimentacao[K],
  ) {
    setCampos((atual) => ({ ...atual, [campo]: valor }))
    setErros((atual) => {
      const proximo = { ...atual }
      delete proximo[erroDoCampo[campo]]
      // "Origem igual ao destino" aparece no destino: mudar a origem também o limpa.
      if (campo === "idEstoqueOrigem") delete proximo.destino
      return proximo
    })
  }

  function mudarTipo(novo: TipoMovimentacao) {
    if (fase !== "editando" || novo === tipo) return
    setTipo(novo)
    setErros({})
    setCampos((atual) => ({
      ...atual,
      idEstoqueOrigem: usaOrigem(novo) ? atual.idEstoqueOrigem : null,
      idEstoqueDestino: usaDestino(novo) ? atual.idEstoqueDestino : null,
    }))
  }

  function limpar() {
    setCampos(camposIniciais)
    setErros({})
  }

  function revisar() {
    if (fase !== "editando") return
    const resultado = validarMovimentacao(tipo, campos)
    if (!resultado.ok || !campos.item) {
      setErros(resultado.ok ? {} : resultado.erros)
      return
    }
    const { dados } = resultado
    const buscar = (id: number | null) =>
      estoques.find((estoque) => estoque.id === id) ?? null
    setErros({})
    setErroEnvio(null)
    setPreparada({
      dados,
      resumo: {
        tipo,
        item: campos.item,
        origem: buscar(dados.idEstoqueOrigem),
        destino: buscar(dados.idEstoqueDestino),
        quantidade: dados.quantidade,
        observacao: dados.observacao,
      },
    })
    setFase("confirmando")
  }

  function voltarParaEdicao() {
    if (fase === "confirmando") setFase("editando")
  }

  async function confirmar() {
    if (enviando.current || fase !== "confirmando" || !preparada) return
    enviando.current = true
    setErroEnvio(null)
    setFase("enviando")
    try {
      const resultado = await prepararMovimentacao(preparada.dados)
      if (resultado.ok) {
        setFase("concluida")
        setCampos(camposIniciais)
      } else {
        setErroEnvio(resultado.mensagem)
        setFase("confirmando")
      }
    } catch {
      setErroEnvio("Não foi possível concluir a operação. Tente novamente.")
      setFase("confirmando")
    } finally {
      enviando.current = false
    }
  }

  function novaMovimentacao() {
    setPreparada(null)
    setErroEnvio(null)
    setFase("editando")
  }

  return {
    tipo,
    campos,
    erros,
    fase,
    resumo: preparada?.resumo ?? null,
    erroEnvio,
    atualizarCampo,
    mudarTipo,
    limpar,
    revisar,
    voltarParaEdicao,
    confirmar,
    novaMovimentacao,
  }
}
