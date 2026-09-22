"use client"
import Link from "next/link"
import { useState } from "react"
import { UserRound } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { UsuarioLogado } from "../types"

export function MenuUsuario({ usuario }: { usuario: UsuarioLogado | null }) {
  const [aberto, setAberto] = useState(false)
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            className="h-auto max-w-60 gap-2 px-2 py-1"
            aria-label={
              usuario
                ? `Conta de ${usuario.nome}`
                : "Minha conta: não autenticado"
            }
          />
        }
      >
        <Avatar>
          <AvatarFallback>
            {usuario ? (
              usuario.nome
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((parte) => parte[0])
                .join("")
                .toUpperCase()
            ) : (
              <UserRound className="size-4" />
            )}
          </AvatarFallback>
        </Avatar>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-sm font-medium">
            {usuario?.nome ?? "Minha conta"}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {usuario?.empresa ?? "Não autenticado"}
          </span>
        </span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Minha conta</DialogTitle>
          <DialogDescription>
            {usuario
              ? "Dados do usuário conectado à empresa."
              : "Nenhum usuário está autenticado nesta sessão."}
          </DialogDescription>
        </DialogHeader>
        {usuario ? (
          <dl className="space-y-4">
            {[
              ["Nome", usuario.nome],
              ["Usuário", usuario.usuario],
              ["Empresa", usuario.empresa],
              ...(usuario.email ? [["E-mail", usuario.email]] : []),
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="font-medium break-words">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <Button
            nativeButton={false}
            render={<Link href="/login" />}
            onClick={() => setAberto(false)}
          >
            Ir para o login
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
