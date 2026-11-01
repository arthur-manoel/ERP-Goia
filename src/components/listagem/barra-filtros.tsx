"use client"

import { useId } from "react"
import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { ControleListagem } from "@/hooks/use-listagem"

/** Filtro configurável por tela. `chave` é o nome do parâmetro que a API espera. */
export type CampoFiltro =
  | {
      tipo: "selecao"
      chave: string
      rotulo: string
      /** Texto da opção que remove o filtro (valor vazio). */
      opcaoTodos: string
      opcoes: Array<{ valor: string; rotulo: string }>
    }
  | { tipo: "texto"; chave: string; rotulo: string; placeholder?: string }
  | { tipo: "periodo"; chaveDe: string; chaveAte: string; rotulo: string }

type Props = {
  listagem: Pick<
    ControleListagem<unknown, unknown>,
    | "busca"
    | "definirBusca"
    | "filtros"
    | "definirFiltro"
    | "limparFiltros"
    | "possuiFiltros"
  >
  /** Sem `placeholderBusca` a caixa de busca não é exibida (API sem busca textual). */
  placeholderBusca?: string
  rotuloBusca?: string
  campos?: CampoFiltro[]
  /** Botão da tela (ex.: "Novo registro"), alinhado à direita. */
  acao?: React.ReactNode
}

export function BarraFiltros({
  listagem,
  placeholderBusca,
  rotuloBusca = "Buscar",
  campos = [],
  acao,
}: Props) {
  const id = useId()
  const valor = (chave: string) => listagem.filtros[chave] ?? ""
  return (
    <div
      role="search"
      aria-label="Filtros da listagem"
      className="flex flex-wrap items-end gap-3"
    >
      {placeholderBusca !== undefined && (
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label={rotuloBusca}
            className="pl-9"
            placeholder={placeholderBusca}
            value={listagem.busca}
            onChange={(evento) => listagem.definirBusca(evento.target.value)}
          />
        </div>
      )}
      {campos.map((campo) => {
        if (campo.tipo === "selecao")
          return (
            <NativeSelect
              key={campo.chave}
              aria-label={campo.rotulo}
              value={valor(campo.chave)}
              onChange={(evento) =>
                listagem.definirFiltro(campo.chave, evento.target.value)
              }
            >
              <NativeSelectOption value="">
                {campo.opcaoTodos}
              </NativeSelectOption>
              {campo.opcoes.map((opcao) => (
                <NativeSelectOption key={opcao.valor} value={opcao.valor}>
                  {opcao.rotulo}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )
        if (campo.tipo === "texto")
          return (
            <Input
              key={campo.chave}
              aria-label={campo.rotulo}
              className="w-48"
              placeholder={campo.placeholder ?? campo.rotulo}
              value={valor(campo.chave)}
              onChange={(evento) =>
                listagem.definirFiltro(campo.chave, evento.target.value)
              }
            />
          )
        const de = valor(campo.chaveDe)
        const ate = valor(campo.chaveAte)
        return (
          <div
            key={campo.chaveDe}
            role="group"
            aria-label={campo.rotulo}
            className="flex items-center gap-2"
          >
            <Label
              className="text-xs text-muted-foreground"
              htmlFor={`${id}-${campo.chaveDe}`}
            >
              {campo.rotulo}
            </Label>
            <Input
              id={`${id}-${campo.chaveDe}`}
              type="date"
              className="w-40"
              value={de}
              max={ate || undefined}
              onChange={(evento) =>
                listagem.definirFiltro(campo.chaveDe, evento.target.value)
              }
            />
            <span aria-hidden className="text-muted-foreground">
              –
            </span>
            <Input
              aria-label={`${campo.rotulo} final`}
              type="date"
              className="w-40"
              value={ate}
              min={de || undefined}
              onChange={(evento) =>
                listagem.definirFiltro(campo.chaveAte, evento.target.value)
              }
            />
          </div>
        )
      })}
      {listagem.possuiFiltros && (
        <Button variant="ghost" onClick={listagem.limparFiltros}>
          <X /> Limpar filtros
        </Button>
      )}
      {acao ? <div className="ml-auto">{acao}</div> : null}
    </div>
  )
}
