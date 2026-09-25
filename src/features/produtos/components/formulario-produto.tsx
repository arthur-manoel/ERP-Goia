"use client"

import { useState, type FormEvent } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

export function FormularioProduto() {
  const [status, setStatus] = useState("ATIVO")

  function salvarProduto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    toast.info("A persistência de produtos será integrada posteriormente.")
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button>
            <Plus data-icon="inline-start" />
            Novo produto
          </Button>
        }
      />
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo produto</DialogTitle>
          <DialogDescription>
            Preencha as informações do produto. O salvamento será integrado em
            uma próxima etapa.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-5" onSubmit={salvarProduto} noValidate>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="codigo">Código *</FieldLabel>
              <Input
                id="codigo"
                name="codigo"
                maxLength={100}
                required
                autoComplete="off"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="nome">Nome *</FieldLabel>
              <Input
                id="nome"
                name="nome"
                maxLength={150}
                required
                autoComplete="off"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="id_tipo_produto">
                Tipo de produto (ID) *
              </FieldLabel>
              <Input
                id="id_tipo_produto"
                name="id_tipo_produto"
                type="number"
                min="1"
                required
              />
              <FieldDescription>
                A seleção de tipos será integrada quando os cadastros estiverem
                disponíveis.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="id_categoria">Categoria (ID)</FieldLabel>
              <Input
                id="id_categoria"
                name="id_categoria"
                type="number"
                min="1"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="unidade">Unidade *</FieldLabel>
              <Input
                id="unidade"
                name="unidade"
                defaultValue="UN"
                maxLength={20}
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="status">Status *</FieldLabel>
              <Select
                value={status}
                onValueChange={(valor) => setStatus(valor ?? "ATIVO")}
              >
                <SelectTrigger id="status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ATIVO">Ativo</SelectItem>
                  <SelectItem value="INATIVO">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>

          <Field>
            <FieldLabel htmlFor="descricao">Descrição</FieldLabel>
            <Textarea
              id="descricao"
              name="descricao"
              maxLength={255}
              className="min-h-24 resize-y"
            />
          </Field>

          <FieldGroup className="grid gap-3 sm:grid-cols-2">
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="controla_estoque">
                  Controla estoque
                </FieldLabel>
                <FieldDescription>
                  Mantém o controle do saldo físico do produto.
                </FieldDescription>
              </FieldContent>
              <Switch
                id="controla_estoque"
                name="controla_estoque"
                defaultChecked
              />
            </Field>

            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="permite_venda">Permite venda</FieldLabel>
                <FieldDescription>
                  Indica se o produto pode ser vendido.
                </FieldDescription>
              </FieldContent>
              <Switch id="permite_venda" name="permite_venda" />
            </Field>

            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="permite_compra">Permite compra</FieldLabel>
                <FieldDescription>
                  Indica se o produto pode ser comprado.
                </FieldDescription>
              </FieldContent>
              <Switch id="permite_compra" name="permite_compra" />
            </Field>

            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="permite_producao">
                  Permite produção
                </FieldLabel>
                <FieldDescription>
                  Indica se o produto pode ser usado na produção.
                </FieldDescription>
              </FieldContent>
              <Switch id="permite_producao" name="permite_producao" />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button type="submit">Salvar produto</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
