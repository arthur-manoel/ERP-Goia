"use client"

import { useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { Skeleton } from "@/components/ui/skeleton"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { consultarSetor } from "../api"
import type { SetorDetalhe } from "../tipos"

const formatarData = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  })

export function DialogoDetalheSetor({
  id,
  onClose,
}: {
  id: number
  onClose: () => void
}) {
  const { requisitar } = useAutenticacao()
  const [setor, setSetor] = useState<SetorDetalhe | null>(null)
  const [erro, setErro] = useState("")

  useEffect(() => {
    let ativo = true
    consultarSetor(requisitar, id).then(
      (dados) => ativo && setSetor(dados),
      (causa) =>
        ativo &&
        setErro(
          causa instanceof Error
            ? causa.message
            : "Não foi possível carregar o setor.",
        ),
    )
    return () => {
      ativo = false
    }
  }, [id, requisitar])

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{setor?.nome ?? "Detalhes do setor"}</DialogTitle>
          <DialogDescription>Dados cadastrados no servidor.</DialogDescription>
        </DialogHeader>
        {erro ? (
          <Alert variant="destructive">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        ) : !setor ? (
          <Skeleton
            role="status"
            aria-label="Carregando setor"
            className="h-32 w-full"
          />
        ) : (
          <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <Badge variant={setor.ativo ? "outline" : "secondary"}>
                {setor.ativo ? "Ativo" : "Inativo"}
              </Badge>
            </dd>
            <dt className="text-muted-foreground">Tipo</dt>
            <dd>{setor.tipo || "—"}</dd>
            <dt className="text-muted-foreground">Descrição</dt>
            <dd className="break-words">{setor.descricao || "—"}</dd>
            <dt className="text-muted-foreground">Recursos</dt>
            <dd>{setor.recursos.length ? setor.recursos.join(", ") : "—"}</dd>
            <dt className="text-muted-foreground">Cadastrado em</dt>
            <dd>{formatarData(setor.createdAt)}</dd>
            <dt className="text-muted-foreground">Atualizado em</dt>
            <dd>{formatarData(setor.updatedAt)}</dd>
          </dl>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
