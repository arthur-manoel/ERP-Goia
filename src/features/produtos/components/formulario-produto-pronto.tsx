"use client"

import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  mensagemErro,
  useAutenticacao,
} from "@/features/autenticacao/provedor-autenticacao"
import {
  createProdutoSchema,
  updateProdutoSchema,
} from "../../../../modules/produtos/schema"
import type { Produto, TipoProduto } from "../tipos"

type Campos = {
  nome: string
  codigo: string
  descricao: string
  idTipoProduto: string
  unidade: string
  controlaEstoque: boolean
  permiteCompra: boolean
  permiteProducao: boolean
  permiteVenda: boolean
}

function camposIniciais(produto: Produto | null): Campos {
  return {
    nome: produto?.nome ?? "",
    codigo: produto?.codigo ?? "",
    descricao: produto?.descricao ?? "",
    idTipoProduto: produto ? String(produto.id_tipo_produto) : "",
    unidade: produto?.unidade ?? "UN",
    controlaEstoque: produto?.controla_estoque ?? true,
    permiteCompra: produto?.permite_compra ?? false,
    permiteProducao: produto?.permite_producao ?? false,
    permiteVenda: produto?.permite_venda ?? true,
  }
}

export function FormularioProdutoPronto({
  produto,
  idEmpresa,
  tipos,
  aoFechar,
  aoSalvar,
}: {
  produto: Produto | null
  idEmpresa: number
  tipos: TipoProduto[]
  aoFechar: () => void
  aoSalvar: () => Promise<void>
}) {
  const { requisitar } = useAutenticacao()
  const [campos, setCampos] = useState(() => camposIniciais(produto))
  const [erro, setErro] = useState("")
  const [salvando, setSalvando] = useState(false)

  function alterar<K extends keyof Campos>(campo: K, valor: Campos[K]) {
    setCampos((atual) => ({ ...atual, [campo]: valor }))
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setErro("")
    const editaveis = {
      nome: campos.nome,
      descricao: campos.descricao.trim() || null,
      id_tipo_produto: Number(campos.idTipoProduto),
      unidade: campos.unidade,
      controla_estoque: Number(campos.controlaEstoque),
      permite_compra: Number(campos.permiteCompra),
      permite_producao: Number(campos.permiteProducao),
      permite_venda: Number(campos.permiteVenda),
    }
    const payload = produto
      ? editaveis
      : {
          ...editaveis,
          id_empresa: idEmpresa,
          codigo: campos.codigo,
          status: "ATIVO",
        }
    const resultado = produto
      ? updateProdutoSchema.safeParse(payload)
      : createProdutoSchema.safeParse(payload)
    if (!resultado.success) {
      setErro(resultado.error.issues[0]?.message ?? "Dados inválidos.")
      return
    }

    setSalvando(true)
    try {
      const resposta = await requisitar(
        produto ? `/api/produtos/${produto.id}` : "/api/produtos",
        {
          method: produto ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      )
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      await aoSalvar()
      toast.success(produto ? "Produto atualizado." : "Produto cadastrado.")
      aoFechar()
    } catch (causa) {
      setErro(
        causa instanceof Error ? causa.message : "Falha ao salvar produto.",
      )
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto && !salvando) aoFechar()
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {produto ? "Editar produto" : "Novo produto"}
          </DialogTitle>
          <DialogDescription>
            Dados do catálogo da empresa selecionada. Código não pode ser
            alterado após o cadastro.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-4">
          <label className="block space-y-1 text-sm font-medium">
            <span>Código *</span>
            <Input
              value={campos.codigo}
              onChange={(e) => alterar("codigo", e.target.value)}
              maxLength={100}
              disabled={Boolean(produto) || salvando}
              required
            />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            <span>Nome *</span>
            <Input
              value={campos.nome}
              onChange={(e) => alterar("nome", e.target.value)}
              maxLength={150}
              disabled={salvando}
              required
            />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            <span>Tipo de produto *</span>
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={campos.idTipoProduto}
              onChange={(e) => alterar("idTipoProduto", e.target.value)}
              disabled={salvando}
              required
            >
              <option value="">Selecione um tipo</option>
              {tipos.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.nome}
                  {tipo.status === "INATIVO" ? " (inativo)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm font-medium">
            <span>Unidade *</span>
            <Input
              value={campos.unidade}
              onChange={(e) => alterar("unidade", e.target.value)}
              maxLength={20}
              disabled={salvando}
              required
            />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            <span>Descrição</span>
            <Input
              value={campos.descricao}
              onChange={(e) => alterar("descricao", e.target.value)}
              maxLength={255}
              disabled={salvando}
            />
          </label>
          <fieldset className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
            <legend className="px-1 text-sm font-medium">
              Operações permitidas
            </legend>
            {(
              [
                ["controlaEstoque", "Controla estoque"],
                ["permiteCompra", "Permite compra"],
                ["permiteProducao", "Permite produção"],
                ["permiteVenda", "Permite venda"],
              ] as const
            ).map(([campo, rotulo]) => (
              <label key={campo} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={campos[campo]}
                  onChange={(e) => alterar(campo, e.target.checked)}
                  disabled={salvando}
                />
                {rotulo}
              </label>
            ))}
          </fieldset>
          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={aoFechar}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando || !campos.idTipoProduto}>
              {salvando
                ? "Salvando..."
                : produto
                  ? "Salvar alterações"
                  : "Cadastrar produto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
