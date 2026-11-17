"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { substituirRecursos } from "../api"
import { RECURSOS_PERMISSAO, rotulosRecursos } from "../recursos"
import type { SetorApi } from "../tipos"

/** Permissões do setor (`permissoes_setor`). Só administradores chegam aqui; o servidor revalida. */
export function DialogoRecursos({
  setor,
  idEmpresa,
  onClose,
  onSaved,
}: {
  setor: SetorApi
  idEmpresa: number
  onClose: () => void
  onSaved: () => void
}) {
  const { requisitar } = useAutenticacao()
  const [selecionados, setSelecionados] = useState(
    () => new Set<string>(setor.recursos),
  )
  const [pendente, setPendente] = useState(false)
  const [erro, setErro] = useState("")

  function alternar(recurso: string, marcado: boolean) {
    setSelecionados((atual) => {
      const proximo = new Set(atual)
      if (marcado) proximo.add(recurso)
      else proximo.delete(recurso)
      return proximo
    })
  }

  async function salvar() {
    setPendente(true)
    setErro("")
    try {
      await substituirRecursos(
        requisitar,
        idEmpresa,
        setor,
        RECURSOS_PERMISSAO.filter((r) => selecionados.has(r)),
      )
      toast.success("Permissões do setor atualizadas.")
      onSaved()
      onClose()
    } catch (causa) {
      setErro(
        causa instanceof Error ? causa.message : "Não foi possível salvar.",
      )
    } finally {
      setPendente(false)
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !pendente && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Permissões de {setor.nome}</DialogTitle>
          <DialogDescription>
            Os recursos abaixo definem o perfil de acesso dos usuários deste
            setor no próximo login. Renomear o setor não altera permissões.
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={pendente} className="grid grid-cols-2 gap-3">
          {RECURSOS_PERMISSAO.map((recurso) => (
            <label key={recurso} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selecionados.has(recurso)}
                onCheckedChange={(marcado) =>
                  alternar(recurso, marcado === true)
                }
              />
              {rotulosRecursos[recurso]}
            </label>
          ))}
        </fieldset>
        {erro && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pendente}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={pendente}>
            {pendente ? "Salvando…" : "Salvar permissões"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
