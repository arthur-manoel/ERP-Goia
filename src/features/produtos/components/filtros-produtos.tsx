import Link from "next/link"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { StatusProduto } from "../queries"

type FiltrosProdutosProps = {
  busca?: string
  status?: StatusProduto
}

export function FiltrosProdutos({ busca, status }: FiltrosProdutosProps) {
  return (
    <form action="/produtos" className="flex flex-wrap items-center gap-2">
      <Input
        name="busca"
        type="search"
        defaultValue={busca}
        placeholder="Buscar por nome ou código"
        aria-label="Buscar por nome, código do produto ou código interno"
        className="w-full sm:w-72"
      />
      <NativeSelect
        name="status"
        defaultValue={status ?? ""}
        aria-label="Filtrar por status"
        className="w-full sm:w-36"
      >
        <NativeSelectOption value="">Todos os status</NativeSelectOption>
        <NativeSelectOption value="ATIVO">Ativo</NativeSelectOption>
        <NativeSelectOption value="INATIVO">Inativo</NativeSelectOption>
      </NativeSelect>
      <Button type="submit">
        <Search data-icon="inline-start" />
        Buscar
      </Button>
      {(busca || status) && (
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/produtos" />}
        >
          Limpar
        </Button>
      )}
    </form>
  )
}
