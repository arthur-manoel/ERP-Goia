"use client"

import { Package } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { formatarQuantidade } from "@/lib/formatacao"
import type { ItemMovimentavel } from "@/lib/movimentacao/tipos"

/** Saldo do item no estoque escolhido. Ainda não existe: virá da API. */
export type SaldoDoItem = { estoque: string; quantidade: string }

type SeletorItemProps = {
  id: string
  itens: ItemMovimentavel[]
  valor: ItemMovimentavel | null
  onChange: (item: ItemMovimentavel | null) => void
  invalido?: boolean
  disabled?: boolean
  /** Quando informado, aparece nos detalhes do item. Hoje ninguém passa. */
  saldo?: SaldoDoItem
}

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

/** Todas as palavras digitadas precisam aparecer no nome, código ou identificador. */
function combina(item: ItemMovimentavel, busca: string) {
  const alvo = normalizar(`${item.nome} ${item.codigo} ${item.id}`)
  return normalizar(busca)
    .split(/\s+/)
    .filter(Boolean)
    .every((termo) => alvo.includes(termo))
}

export function SeletorItem({
  id,
  itens,
  valor,
  onChange,
  invalido,
  disabled,
  saldo,
}: SeletorItemProps) {
  return (
    <div className="flex flex-col gap-2">
      <Combobox
        items={itens}
        value={valor}
        onValueChange={onChange}
        itemToStringLabel={(item) => item.nome}
        isItemEqualToValue={(a, b) => a.id === b.id}
        filter={combina}
        disabled={disabled}
      >
        <ComboboxInput
          id={id}
          placeholder="Buscar por nome, código ou identificador"
          autoComplete="off"
          aria-invalid={invalido}
          showClear
        />
        <ComboboxContent>
          <ComboboxEmpty>
            Nenhum item encontrado. Confira o nome, o código ou o identificador.
          </ComboboxEmpty>
          <ComboboxList>
            {(item: ItemMovimentavel) => (
              <ComboboxItem key={item.id} value={item}>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{item.nome}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.codigo} · ID {item.id} · {item.unidade}
                  </span>
                </div>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      {valor && (
        <Item variant="muted" size="sm">
          <ItemMedia variant="icon">
            <Package aria-hidden />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{valor.nome}</ItemTitle>
            <ItemDescription>
              Código {valor.codigo} · Identificador {valor.id}
              {saldo &&
                ` · Saldo em ${saldo.estoque}: ${formatarQuantidade(saldo.quantidade)} ${valor.unidade}`}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Badge variant="secondary">{valor.unidade}</Badge>
          </ItemActions>
        </Item>
      )}
    </div>
  )
}
