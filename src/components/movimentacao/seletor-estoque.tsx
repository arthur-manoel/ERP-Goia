"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { EstoqueOpcao } from "@/lib/movimentacao/tipos"

type SeletorEstoqueProps = {
  id: string
  estoques: EstoqueOpcao[]
  valor: number | null
  onChange: (id: number | null) => void
  /** Estoque que não pode ser escolhido aqui (o outro lado da transferência). */
  desabilitarId?: number | null
  invalido?: boolean
  disabled?: boolean
}

export function SeletorEstoque({
  id,
  estoques,
  valor,
  onChange,
  desabilitarId,
  invalido,
  disabled,
}: SeletorEstoqueProps) {
  return (
    <Select
      value={valor}
      onValueChange={onChange}
      items={estoques.map((e) => ({ value: e.id, label: e.nome }))}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full" aria-invalid={invalido}>
        <SelectValue placeholder="Selecione o estoque" />
      </SelectTrigger>
      <SelectContent>
        {estoques.map((estoque) => (
          <SelectItem
            key={estoque.id}
            value={estoque.id}
            disabled={estoque.id === desabilitarId}
          >
            {estoque.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
