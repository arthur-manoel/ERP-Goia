import Link from "next/link"
import { ArrowRight, CircleAlert, TriangleAlert, type LucideIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { ResultadoIndicador } from "@/lib/dashboard/tipos"
import { cn } from "@/lib/utils"

export type IndicadorCardProps = {
  /** Identificador estável do indicador (usado na acessibilidade). */
  id: string
  titulo: string
  icone: LucideIcon
  /** Atalho para o módulo do indicador. Omita quando ainda não existe tela. */
  link?: { href: string; rotulo: string }
  /** Ex.: largura maior na grade ("md:col-span-2"). */
  className?: string
  children: React.ReactNode
}

/** Casca de um indicador da Dashboard. O conteúdo vem em `children`. */
export function IndicadorCard({
  id,
  titulo,
  icone: Icone,
  link,
  className,
  children,
}: IndicadorCardProps) {
  const idTitulo = `${id}-titulo`

  return (
    <Card role="group" aria-labelledby={idTitulo} className={cn("min-w-0", className)}>
      <CardHeader>
        <CardDescription id={idTitulo}>
          {titulo}
        </CardDescription>
        <CardAction>
          <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-foreground">
            <Icone className="size-4" aria-hidden />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {children}
      </CardContent>
      {link && (
        <CardFooter>
          <Link
            href={link.href}
            className={cn(
              buttonVariants({ variant: "link", size: "sm" }),
              "-ml-2.5",
            )}
          >
            {link.rotulo}
            <ArrowRight data-icon="inline-end" aria-hidden />
          </Link>
        </CardFooter>
      )}
    </Card>
  )
}

/** Número principal do indicador, com a unidade ao lado (ex.: "12 itens"). */
export function IndicadorValor({
  valor,
  unidade,
}: {
  valor: string
  unidade?: string
}) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="min-w-0 text-3xl font-semibold tracking-tight tabular-nums break-words">
        {valor}
      </span>
      {unidade && (
        <span className="text-sm text-muted-foreground">{unidade}</span>
      )}
    </p>
  )
}

/** Agrupa valor principal, alertas e comparação: a "primeira leitura" do card. */
export function IndicadorResumo({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2">{children}</div>
}

/** Situação que exige atenção. Sempre por escrito, com ícone: nunca só cor. */
export function IndicadorAlerta({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="destructive">
      <TriangleAlert data-icon="inline-start" aria-hidden />
      {children}
    </Badge>
  )
}

/** Linha de alertas do card (quebra em várias linhas em telas estreitas). */
export function IndicadorAlertas({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>
}

type EstadoIndisponivel = Exclude<ResultadoIndicador<unknown>["estado"], "ok">

/**
 * Card para indicador que não pôde ser exibido.
 * - sem_permissao: não renderiza nada (o usuário não deve nem saber do valor).
 * - erro: mensagem amigável, sem detalhes técnicos.
 * - nao_integrado: a consulta real ainda não existe.
 */
export function IndicadorIndisponivel({
  estado,
  ...props
}: Omit<IndicadorCardProps, "children"> & { estado: EstadoIndisponivel }) {
  if (estado === "sem_permissao") return null

  return (
    <IndicadorCard {...props}>
      {estado === "erro" ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>Não foi possível carregar.</AlertTitle>
          <AlertDescription>
            Atualize a página em instantes.
          </AlertDescription>
        </Alert>
      ) : (
        <p className="text-sm text-muted-foreground">
          Indicador em integração.
        </p>
      )}
    </IndicadorCard>
  )
}

/** Placeholder de carregamento com as mesmas medidas do card (evita "pulo" de layout). */
export function IndicadorCardSkeleton({ className }: { className?: string }) {
  return (
    <Card
      role="status"
      aria-busy="true"
      aria-label="Carregando indicador"
      className={className}
    >
      <CardHeader>
        <CardDescription>
          <Skeleton className="h-5 w-2/3" />
        </CardDescription>
        <CardAction>
          <Skeleton className="size-8 rounded-lg" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-1/3" />
          <Skeleton className="h-5 w-1/2" />
        </div>
        <div className="flex flex-col gap-2 border-t pt-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </CardContent>
      <CardFooter>
        <Skeleton className="h-7 w-24" />
      </CardFooter>
    </Card>
  )
}
