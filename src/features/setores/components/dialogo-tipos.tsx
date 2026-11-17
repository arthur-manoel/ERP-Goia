"use client"

import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { alterarStatusTipo, criarTipo } from "../api"
import type { TipoSetor } from "../tipos"

/** Gestão de `tipos_setor` (somente administradores; o servidor revalida). */
export function DialogoTipos({
  idEmpresa,
  tipos,
  carregando,
  erro,
  onClose,
  onChanged,
}: {
  idEmpresa: number
  tipos: TipoSetor[]
  carregando: boolean
  erro: string
  onClose: () => void
  onChanged: () => void
}) {
  const { requisitar } = useAutenticacao()
  const [nome, setNome] = useState("")
  const [pendente, setPendente] = useState(false)
  const [falha, setFalha] = useState("")

  async function executar(operacao: () => Promise<unknown>, sucesso: string) {
    setPendente(true)
    setFalha("")
    try {
      await operacao()
      toast.success(sucesso)
      onChanged()
    } catch (causa) {
      setFalha(
        causa instanceof Error ? causa.message : "Não foi possível concluir.",
      )
    } finally {
      setPendente(false)
    }
  }

  function adicionar(evento: FormEvent) {
    evento.preventDefault()
    if (!nome.trim() || pendente) return
    void executar(async () => {
      await criarTipo(requisitar, idEmpresa, nome)
      setNome("")
    }, "Tipo cadastrado.")
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !pendente && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tipos de setor</DialogTitle>
          <DialogDescription>
            Tipos disponíveis ao cadastrar setores desta empresa. O nome não
            pode ser alterado; inative um tipo para tirá-lo de uso.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={adicionar} className="flex gap-2">
          <Input
            aria-label="Nome do novo tipo"
            placeholder="Novo tipo (ex.: Apoio)"
            maxLength={80}
            value={nome}
            disabled={pendente}
            onChange={(e) => setNome(e.target.value)}
          />
          <Button type="submit" disabled={pendente || !nome.trim()}>
            Adicionar
          </Button>
        </form>
        {(falha || erro) && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{falha || erro}</AlertDescription>
          </Alert>
        )}
        <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
          {carregando && <li className="p-3 text-sm">Carregando…</li>}
          {!carregando && !tipos.length && (
            <li className="p-3 text-sm text-muted-foreground">
              Nenhum tipo cadastrado. Setores usam o tipo padrão “Outro”.
            </li>
          )}
          {tipos.map((tipo) => (
            <li key={tipo.id} className="flex items-center gap-3 p-3 text-sm">
              <span className="flex-1 font-medium">{tipo.nome}</span>
              <Badge variant={tipo.ativo ? "outline" : "secondary"}>
                {tipo.ativo ? "Ativo" : "Inativo"}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                disabled={pendente}
                onClick={() =>
                  void executar(
                    () =>
                      alterarStatusTipo(
                        requisitar,
                        idEmpresa,
                        tipo,
                        !tipo.ativo,
                      ),
                    tipo.ativo ? "Tipo inativado." : "Tipo reativado.",
                  )
                }
              >
                {tipo.ativo ? "Inativar" : "Reativar"}
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
