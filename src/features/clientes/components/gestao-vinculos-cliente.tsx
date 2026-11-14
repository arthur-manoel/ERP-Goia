"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import {
  excluirContatoCliente,
  excluirEnderecoCliente,
  listarVinculosCliente,
  salvarContatoCliente,
  salvarEnderecoCliente,
  type ContatoClienteApi,
  type EnderecoClienteApi,
} from "../api"

type Props = { idCliente: number; idEmpresa: number }
type Editor =
  | { tipo: "contato"; id?: number; valor: Record<string, string | boolean> }
  | { tipo: "endereco"; id?: number; valor: Record<string, string | boolean> }
  | null
type Exclusao = {
  tipo: "contato" | "endereco"
  id: number
  titulo: string
} | null
const contatoVazio = () => ({
  tipo: "TELEFONE",
  valor: "",
  descricao: "",
  principal: false,
})
const enderecoVazio = () => ({
  tipo: "ENTREGA",
  descricao: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  cep: "",
  referencia: "",
  principal: false,
})

export function GestaoVinculosCliente({ idCliente, idEmpresa }: Props) {
  const { requisitar } = useAutenticacao()
  const [contatos, setContatos] = useState<ContatoClienteApi[]>([])
  const [enderecos, setEnderecos] = useState<EnderecoClienteApi[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState("")
  const [editor, setEditor] = useState<Editor>(null)
  const [exclusao, setExclusao] = useState<Exclusao>(null)

  const carregar = useCallback(
    async (signal?: AbortSignal) => {
      setCarregando(true)
      setErro("")
      try {
        const dados = await listarVinculosCliente(
          requisitar,
          idEmpresa,
          idCliente,
          signal,
        )
        if (!signal?.aborted) {
          setContatos(dados.contatos)
          setEnderecos(dados.enderecos)
        }
      } catch (causa) {
        if (!signal?.aborted)
          setErro(
            causa instanceof Error
              ? causa.message
              : "Não foi possível carregar os contatos e endereços.",
          )
      } finally {
        if (!signal?.aborted) setCarregando(false)
      }
    },
    [requisitar, idEmpresa, idCliente],
  )
  useEffect(() => {
    const controller = new AbortController()
    void carregar(controller.signal)
    return () => controller.abort()
  }, [carregar])

  function alterar(campo: string, valor: string | boolean) {
    setEditor((atual) =>
      atual ? { ...atual, valor: { ...atual.valor, [campo]: valor } } : null,
    )
  }
  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor || salvando) return
    setSalvando(true)
    try {
      if (editor.tipo === "contato")
        await salvarContatoCliente(
          requisitar,
          idEmpresa,
          idCliente,
          editor.valor,
          editor.id,
        )
      else
        await salvarEnderecoCliente(
          requisitar,
          idEmpresa,
          idCliente,
          editor.valor,
          editor.id,
        )
      toast.success(editor.id ? "Cadastro atualizado." : "Cadastro adicionado.")
      setEditor(null)
      await carregar()
    } catch (causa) {
      toast.error(
        causa instanceof Error ? causa.message : "Não foi possível salvar.",
      )
    } finally {
      setSalvando(false)
    }
  }
  async function confirmarExclusao() {
    if (!exclusao) return
    setSalvando(true)
    try {
      if (exclusao.tipo === "contato")
        await excluirContatoCliente(
          requisitar,
          idEmpresa,
          idCliente,
          exclusao.id,
        )
      else
        await excluirEnderecoCliente(
          requisitar,
          idEmpresa,
          idCliente,
          exclusao.id,
        )
      toast.success("Cadastro removido.")
      setExclusao(null)
      await carregar()
    } catch (causa) {
      toast.error(
        causa instanceof Error ? causa.message : "Não foi possível remover.",
      )
    } finally {
      setSalvando(false)
    }
  }
  const campo = (
    nome: string,
    rotulo: string,
    maxLength: number,
    type = "text",
    required = false,
  ) => (
    <Field key={nome}>
      <FieldLabel htmlFor={`vinculo-${nome}`}>{rotulo}</FieldLabel>
      <Input
        id={`vinculo-${nome}`}
        type={type}
        maxLength={maxLength}
        required={required}
        value={String(editor?.valor[nome] ?? "")}
        onChange={(e) => alterar(nome, e.target.value)}
      />
    </Field>
  )
  const select = (nome: string, rotulo: string, opcoes: [string, string][]) => (
    <Field key={nome}>
      <FieldLabel htmlFor={`vinculo-${nome}`}>{rotulo}</FieldLabel>
      <select
        id={`vinculo-${nome}`}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={String(editor?.valor[nome] ?? "")}
        onChange={(e) => alterar(nome, e.target.value)}
      >
        {opcoes.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </Field>
  )

  return (
    <section
      className="space-y-6 border-t pt-5"
      aria-label="Contatos e endereços do cliente"
    >
      <div>
        <h3 className="font-medium">Contatos e endereços</h3>
        <p className="text-sm text-muted-foreground">
          Cadastre telefones e endereços de entrega e cobrança usados nos
          pedidos.
        </p>
      </div>
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>
            {erro}{" "}
            <Button variant="outline" size="sm" onClick={() => void carregar()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {carregando ? (
        <Skeleton
          className="h-32 w-full"
          aria-label="Carregando contatos e endereços"
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3" aria-label="Contatos">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Contatos</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setEditor({ tipo: "contato", valor: contatoVazio() })
                }
              >
                Adicionar contato
              </Button>
            </div>
            {contatos.length ? (
              contatos.map((item) => (
                <article
                  key={item.id}
                  className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{item.tipo}</strong>
                      {item.principal && <Badge>Principal</Badge>}
                    </div>
                    <p className="break-words">{item.valor}</p>
                    {item.descricao && (
                      <p className="text-muted-foreground">{item.descricao}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setEditor({
                          tipo: "contato",
                          id: item.id,
                          valor: {
                            tipo: item.tipo,
                            valor: item.valor,
                            descricao: item.descricao ?? "",
                            principal: item.principal,
                          },
                        })
                      }
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setExclusao({
                          tipo: "contato",
                          id: item.id,
                          titulo: item.valor,
                        })
                      }
                    >
                      Excluir
                    </Button>
                  </div>
                </article>
              ))
            ) : (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                Nenhum contato cadastrado.
              </p>
            )}
          </section>
          <section className="space-y-3" aria-label="Endereços">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Endereços</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setEditor({ tipo: "endereco", valor: enderecoVazio() })
                }
              >
                Adicionar endereço
              </Button>
            </div>
            {enderecos.length ? (
              enderecos.map((item) => (
                <article
                  key={item.id}
                  className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{item.descricao || item.tipo}</strong>
                      <Badge variant="outline">{item.tipo}</Badge>
                      {item.principal && <Badge>Principal</Badge>}
                    </div>
                    <p className="break-words">
                      {[
                        item.endereco,
                        item.numero,
                        item.complemento,
                        item.bairro,
                        item.cidade,
                        item.estado,
                        item.cep,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                    {item.referencia && (
                      <p className="text-muted-foreground">
                        Referência: {item.referencia}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setEditor({
                          tipo: "endereco",
                          id: item.id,
                          valor: {
                            tipo: item.tipo,
                            descricao: item.descricao ?? "",
                            endereco: item.endereco,
                            numero: item.numero ?? "",
                            complemento: item.complemento ?? "",
                            bairro: item.bairro ?? "",
                            cidade: item.cidade ?? "",
                            estado: item.estado ?? "",
                            cep: item.cep ?? "",
                            referencia: item.referencia ?? "",
                            principal: item.principal,
                          },
                        })
                      }
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setExclusao({
                          tipo: "endereco",
                          id: item.id,
                          titulo: item.endereco,
                        })
                      }
                    >
                      Excluir
                    </Button>
                  </div>
                </article>
              ))
            ) : (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                Nenhum endereço cadastrado.
              </p>
            )}
          </section>
        </div>
      )}

      {editor && (
        <form
          onSubmit={salvar}
          className="space-y-4 rounded-lg border p-4"
          aria-label={
            editor.tipo === "contato"
              ? "Formulário de contato"
              : "Formulário de endereço"
          }
        >
          <h4 className="font-medium">
            {editor.id ? "Editar" : "Novo"}{" "}
            {editor.tipo === "contato" ? "contato" : "endereço"}
          </h4>
          {editor.tipo === "contato" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {select("tipo", "Tipo", [
                ["TELEFONE", "Telefone"],
                ["CELULAR", "Celular"],
                ["WHATSAPP", "WhatsApp"],
                ["EMAIL", "E-mail"],
                ["OUTRO", "Outro"],
              ])}
              {campo("valor", "Telefone ou e-mail", 150, "text", true)}
              {campo("descricao", "Descrição / responsável", 100)}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editor.valor.principal)}
                  onChange={(e) => alterar("principal", e.target.checked)}
                />
                Contato principal
              </label>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {select("tipo", "Finalidade", [
                ["PRINCIPAL", "Principal"],
                ["ENTREGA", "Entrega"],
                ["COBRANCA", "Cobrança"],
                ["OUTRO", "Outro"],
              ])}
              {campo("descricao", "Descrição", 100)}
              {campo("endereco", "Logradouro", 255, "text", true)}
              {campo("numero", "Número", 20)}
              {campo("complemento", "Complemento", 100)}
              {campo("bairro", "Bairro", 100)}
              {campo("cidade", "Cidade", 100)}
              {campo("estado", "UF", 2)}
              {campo("cep", "CEP", 9)}
              {campo("referencia", "Referência", 255)}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editor.valor.principal)}
                  onChange={(e) => alterar("principal", e.target.checked)}
                />
                Usar como endereço padrão
              </label>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={salvando}
              onClick={() => setEditor(null)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      )}
      <AlertDialog
        open={!!exclusao}
        onOpenChange={(open) => {
          if (!open && !salvando) setExclusao(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cadastro?</AlertDialogTitle>
            <AlertDialogDescription>
              “{exclusao?.titulo}” ficará inativo. Os pedidos já vinculados
              continuarão preservando seus dados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={salvando}
              onClick={(e) => {
                e.preventDefault()
                void confirmarExclusao()
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
