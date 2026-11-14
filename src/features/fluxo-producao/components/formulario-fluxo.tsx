"use client"

import { useState, type FormEvent } from "react"
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  mensagemErro,
  useAutenticacao,
} from "@/features/autenticacao/provedor-autenticacao"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import {
  formularioVazio,
  moverSetor,
  paraFormulario,
  setoresParaAdicionar,
  validarFormulario,
} from "../regras-api"
import type { Fluxo, FormularioFluxo as Formulario, Setor } from "../tipos"

const endpoint = "/api/fluxos-producao"

export function FormularioFluxo({
  fluxo,
  setores,
  onClose,
  onSaved,
}: {
  /** Fluxo em edição; `null` cadastra um novo. */
  fluxo: Fluxo | null
  /** Todos os setores da empresa (ativos e inativos). */
  setores: Setor[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { requisitar } = useAutenticacao()
  const [formulario, setFormulario] = useState<Formulario>(
    fluxo ? paraFormulario(fluxo) : formularioVazio,
  )
  const [novoSetor, setNovoSetor] = useState("")
  const [erro, setErro] = useState("")
  const [salvando, setSalvando] = useState(false)

  // Para mostrar o nome de setores do próprio fluxo mesmo que a lista de
  // setores não os traga (ex.: removidos), usamos o fluxo como reserva.
  const porId = new Map<number, Setor>([
    ...(fluxo?.setores ?? []).map((s) => [s.id, s] as const),
    ...setores.map((s) => [s.id, s] as const),
  ])
  const opcoes = setoresParaAdicionar(setores, formulario.setores).map(
    (setor) => ({ value: String(setor.id), label: setor.nome }),
  )

  function alterar<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }))
  }

  function adicionar() {
    if (!novoSetor) return
    alterar("setores", [...formulario.setores, Number(novoSetor)])
    setNovoSetor("")
    setErro("")
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setErro("")
    const resultado = validarFormulario(formulario, setores, fluxo)
    if (!resultado.ok) {
      setErro(resultado.erro)
      return
    }

    setSalvando(true)
    try {
      const resposta = await requisitar(
        fluxo ? `${endpoint}/${fluxo.id}` : endpoint,
        {
          method: fluxo ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resultado.payload),
        },
      )
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      await onSaved()
      toast.success(
        fluxo
          ? "Fluxo de produção atualizado."
          : "Fluxo de produção cadastrado.",
      )
      onClose()
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Falha ao salvar.")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto && !salvando) onClose()
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {fluxo ? "Editar fluxo de produção" : "Novo fluxo de produção"}
          </DialogTitle>
          <DialogDescription>
            Monte a sequência de setores pela qual a peça passa. Ex.: Sublimação
            → Corte → Costura → Aprontamento.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={salvar} noValidate className="space-y-5">
          <fieldset disabled={salvando} className="space-y-5">
            <Field>
              <FieldLabel htmlFor="fluxo-nome">Nome *</FieldLabel>
              <Input
                id="fluxo-nome"
                placeholder="Ex.: Camiseta sublimada"
                value={formulario.nome}
                onChange={(e) => alterar("nome", e.target.value)}
                maxLength={100}
                autoFocus
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="fluxo-descricao">
                Descrição (opcional)
              </FieldLabel>
              <Textarea
                id="fluxo-descricao"
                placeholder="Para quais produtos este fluxo serve"
                rows={2}
                value={formulario.descricao}
                onChange={(e) => alterar("descricao", e.target.value)}
                maxLength={255}
              />
            </Field>

            <Field>
              <FieldLabel>Sequência de setores *</FieldLabel>
              <div className="space-y-2 rounded-lg border p-3">
                {formulario.setores.length === 0 && (
                  <Empty className="border-0 py-4">
                    <EmptyTitle>Nenhum setor na sequência</EmptyTitle>
                    <EmptyDescription>
                      Escolha um setor abaixo e clique em &quot;Adicionar&quot;
                      para montar o caminho da produção.
                    </EmptyDescription>
                  </Empty>
                )}
                {formulario.setores.map((id, indice) => {
                  const setor = porId.get(id)
                  const total = formulario.setores.length
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                        {indice + 1}
                      </span>
                      <span className="flex-1 truncate text-sm font-medium">
                        {setor?.nome ?? "Setor não encontrado"}
                      </span>
                      {(!setor || !setor.ativo) && (
                        <Badge variant="destructive">Inativo</Badge>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Mover ${setor?.nome ?? "setor"} para cima`}
                        disabled={indice === 0}
                        onClick={() =>
                          alterar(
                            "setores",
                            moverSetor(formulario.setores, indice, indice - 1),
                          )
                        }
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Mover ${setor?.nome ?? "setor"} para baixo`}
                        disabled={indice === total - 1}
                        onClick={() =>
                          alterar(
                            "setores",
                            moverSetor(formulario.setores, indice, indice + 1),
                          )
                        }
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remover ${setor?.nome ?? "setor"}`}
                        onClick={() =>
                          alterar(
                            "setores",
                            formulario.setores.filter((_, i) => i !== indice),
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )
                })}
              </div>

              <div className="flex items-end gap-2 pt-1">
                <div className="flex-1">
                  <SearchSelect
                    id="fluxo-adicionar-setor"
                    label="Adicionar setor à sequência"
                    value={novoSetor}
                    onValueChange={setNovoSetor}
                    options={opcoes}
                    disabled={opcoes.length === 0}
                    placeholder={
                      opcoes.length
                        ? "Escolha um setor..."
                        : "Nenhum setor ativo disponível"
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!novoSetor}
                  onClick={adicionar}
                >
                  <Plus /> Adicionar
                </Button>
              </div>
              {setores.every((setor) => !setor.ativo) && (
                <p className="text-xs text-muted-foreground">
                  Nenhum setor ativo cadastrado. Cadastre os setores (ex.:
                  Sublimação, Corte, Costura, Aprontamento) antes de montar o
                  fluxo.
                </p>
              )}
            </Field>

            <div className="flex items-center gap-3">
              <Switch
                id="fluxo-ativo"
                checked={formulario.ativo}
                onCheckedChange={(valor) => alterar("ativo", valor)}
              />
              <FieldLabel htmlFor="fluxo-ativo">
                {formulario.ativo ? "Fluxo ativo" : "Fluxo inativo"}
              </FieldLabel>
            </div>

            {erro && <FieldError role="alert">{erro}</FieldError>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit">{salvando ? "Salvando…" : "Salvar"}</Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  )
}
