"use client"

import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import type { StatusProduto } from "../constantes"

type FiltrosProdutosProps = {
  busca: string
  status?: StatusProduto
  onBuscaChange: (busca: string) => void
  onStatusChange: (status: StatusProduto | undefined) => void
  onLimpar: () => void
}

export function FiltrosProdutos({
  busca,
  status,
  onBuscaChange,
  onStatusChange,
  onLimpar,
}: FiltrosProdutosProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="search"
        value={busca}
        onChange={(event) => onBuscaChange(event.target.value)}
        placeholder="Buscar por nome, código ou código interno"
        aria-label="Buscar por nome, código do produto ou código interno"
        className="w-full sm:w-72"
      />
      <Combobox
        value={status ?? null}
        onValueChange={(valor) =>
          onStatusChange(
            valor === "ATIVO" || valor === "INATIVO" ? valor : undefined,
          )
        }
      >
        <ComboboxInput
          placeholder="Todos"
          aria-label="Filtrar por situação"
          className="w-full sm:w-44"
          showClear
        />
        <ComboboxContent>
          <ComboboxList>
            <ComboboxItem value={null}>Todos</ComboboxItem>
            <ComboboxItem value="ATIVO">Ativo</ComboboxItem>
            <ComboboxItem value="INATIVO">Inativo</ComboboxItem>
          </ComboboxList>
          <ComboboxEmpty>Nenhuma opção encontrada.</ComboboxEmpty>
        </ComboboxContent>
      </Combobox>
      <Button type="button" variant="outline" onClick={onLimpar}>
        Limpar filtros
      </Button>
    </div>
  )
}
