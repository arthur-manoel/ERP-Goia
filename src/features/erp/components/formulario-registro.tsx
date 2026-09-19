"use client"
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type FieldValues,
} from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { ZodType } from "zod"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  schemas,
  type Collection,
  type Data,
} from "@/features/erp/tipos"
import { unidades, calcularVenda } from "@/features/estoque/schemas"
import { tiposEndereco as addressTypes } from "@/features/clientes/schemas"
import { formatarMoeda as brl } from "@/lib/formatacao"
import { useErp } from "./provedor"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { SearchSelect, type Option } from "./seletor-pesquisavel"
import { Alert, AlertDescription } from "@/components/ui/alert"

type FormField = {
  key: string
  label: string
  type?: "number" | "email" | "date" | "textarea"
  readOnly?: boolean
  optional?: boolean
  options?: Option[]
}
const options = (values: string[]) =>
  values.map((value) => ({ value, label: value }))
export function RecordForm({
  collection,
  initial,
  title,
  onClose,
  returnFocus,
}: {
  collection: Collection
  initial: FieldValues
  title: string
  onClose: () => void
  returnFocus: () => void
}) {
  const { data, save } = useErp()
  const validationSchema: ZodType<FieldValues, FieldValues> =
    schemas[collection]
  const form = useForm<FieldValues>({
    resolver: zodResolver(validationSchema),
    defaultValues: initial,
  })
  const components = useFieldArray({
    control: form.control,
    name: "components",
  })
  const items = useFieldArray({ control: form.control, name: "items" })
  const addresses = useFieldArray({ control: form.control, name: "addresses" })
  const values = useWatch({ control: form.control })
  const db = data as Data
  const productOptions = db.materials
    .filter((row) => row.category === "Produto pronto")
    .map((row) => ({ value: row.id, label: row.name }))
  const componentOptions = db.materials
    .filter((row) => row.id !== initial.id)
    .map((row) => ({ value: row.id, label: row.name + " · " + row.unit }))
  const fields: Record<Collection, FormField[]> = {
    materials: [
      { key: "name", label: "Nome do material" },
      { key: "code", label: "Código" },
      {
        key: "category",
        label: "Categoria",
        options: options(["Tecido", "Aviamento", "Produto pronto"]),
      },
      {
        key: "unit",
        label: "Unidade",
        options: [...unidades],
      },
      { key: "quantity", label: "Saldo atual", type: "number" },
      { key: "minimum", label: "Estoque mínimo", type: "number" },
      {
        key: "description",
        label: "Descrição do produto",
        type: "textarea",
        optional: true,
      },
      { key: "cost", label: "Preço de custo (R$)", type: "number" },
      { key: "margin", label: "Margem de lucro (%)", type: "number" },
      {
        key: "salePrice",
        label: "Preço de venda (R$)",
        type: "number",
        readOnly: true,
      },
      ...(values.category === "Produto pronto"
        ? [
            {
              key: "kind",
              label: "Tipo de produto",
              options: options(["Comprado", "Fabricado", "Kit"]),
            },
          ]
        : []),
    ],
    clients: [
      {
        key: "personType",
        label: "Tipo de pessoa",
        options: [
          { value: "PF", label: "Pessoa física" },
          { value: "PJ", label: "Pessoa jurídica" },
        ],
      },
      { key: "document", label: values.personType === "PJ" ? "CNPJ" : "CPF" },
      {
        key: "role",
        label: "Perfil do cadastro",
        options: options(["Cliente", "Fornecedor", "Cliente e fornecedor"]),
      },
      { key: "name", label: "Nome / razão social" },
      { key: "email", label: "E-mail", type: "email" },
      { key: "phone", label: "Telefone com DDD" },
      {
        key: "status",
        label: "Situação",
        options: options(["Ativo", "Inativo"]),
      },
    ],
    productions: [
      { key: "code", label: "Código da ordem" },
      { key: "productId", label: "Produto pronto", options: productOptions },
      { key: "quantity", label: "Quantidade de peças", type: "number" },
      {
        key: "status",
        label: "Situação",
        options: options([
          "Planejada",
          "Em produção",
          "Concluída",
          "Cancelada",
        ]),
      },
      { key: "startDate", label: "Data de início", type: "date" },
      { key: "dueDate", label: "Previsão de conclusão", type: "date" },
      { key: "notes", label: "Observações", type: "textarea", optional: true },
    ],
    orders: [
      { key: "code", label: "Código do pedido" },
      {
        key: "clientId",
        label: "Cliente",
        options: db.clients
          .filter((row) => row.role !== "Fornecedor")
          .map((row) => ({
            value: row.id,
            label: row.name + (row.status === "Inativo" ? " (inativo)" : ""),
            disabled: row.status !== "Ativo" && row.id !== initial.clientId,
          })),
      },
      { key: "date", label: "Data do pedido", type: "date" },
      { key: "dueDate", label: "Previsão de entrega", type: "date" },
      {
        key: "status",
        label: "Situação",
        options: options(["Recebido", "Em produção", "Entregue", "Cancelado"]),
      },
    ],
    transactions: [
      { key: "description", label: "Descrição" },
      { key: "type", label: "Tipo", options: options(["Pagar", "Receber"]) },
      {
        key: "partyId",
        label: values.type === "Receber" ? "Cliente" : "Fornecedor",
        options: db.clients
          .filter((row) =>
            values.type === "Receber"
              ? row.role !== "Fornecedor"
              : row.role !== "Cliente",
          )
          .map((row) => ({
            value: row.id,
            label: `${row.name} · ${row.document}${row.status === "Inativo" ? " (inativo)" : ""}`,
            disabled: row.status !== "Ativo" && row.id !== initial.partyId,
          })),
      },
      { key: "amount", label: "Valor (R$)", type: "number" },
      { key: "dueDate", label: "Vencimento", type: "date" },
      {
        key: "status",
        label: "Situação",
        options: options(["Em aberto", "Liquidado"]),
      },
      {
        key: "paidDate",
        label: "Data de liquidação",
        type: "date",
        optional: values.status !== "Liquidado",
      },
    ],
  }
  async function submit(values: FieldValues) {
    try {
      await save(collection, values, initial.id)
      toast.success(
        initial.id ? "Registro atualizado." : "Registro cadastrado.",
      )
      onClose()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível salvar."
      form.setError("root.server", { message })
      toast.error(message)
    }
  }
  function renderField(field: FormField) {
    const error = form.getFieldState(field.key, form.formState).error
    const id = `record-${field.key}`
    return (
      <Field
        key={field.key}
        data-invalid={!!error}
        className={field.type === "textarea" ? "sm:col-span-2" : ""}
      >
        <FieldLabel htmlFor={id}>
          {field.label}
          {field.optional ? " (opcional)" : " *"}
        </FieldLabel>
        {field.options ? (
          <Controller
            control={form.control}
            name={field.key}
            render={({ field: control }) => (
              <SearchSelect
                value={control.value ?? ""}
                options={field.options ?? []}
                onValueChange={(value) => {
                  control.onChange(value)
                  if (
                    collection === "materials" &&
                    ((field.key === "category" && value !== "Produto pronto") ||
                      (field.key === "kind" && value === "Comprado"))
                  ) {
                    form.setValue("kind", "Comprado")
                    components.replace([])
                    form.clearErrors("components")
                  }
                  if (
                    collection === "transactions" &&
                    field.key === "status" &&
                    value === "Em aberto"
                  )
                    form.setValue("paidDate", "")
                  if (collection === "transactions" && field.key === "type")
                    form.setValue("partyId", "")
                  if (collection === "clients" && field.key === "personType") {
                    form.setValue("document", "")
                    form.clearErrors("document")
                  }
                }}
                id={id}
                ref={control.ref}
                onBlur={control.onBlur}
                invalid={!!error}
                describedBy={error ? `${id}-error` : undefined}
                disabled={form.formState.isSubmitting}
              />
            )}
          />
        ) : field.type === "textarea" ? (
          <Textarea
            id={id}
            {...form.register(field.key)}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
          />
        ) : (
          <Input
            id={id}
            type={field.type ?? "text"}
            readOnly={field.readOnly}
            aria-describedby={
              field.readOnly
                ? "explicacao-preco"
                : error
                  ? `${id}-error`
                  : undefined
            }
            min={field.type === "number" ? 0 : undefined}
            step={field.type === "number" ? "any" : undefined}
            {...form.register(field.key, {
              valueAsNumber: field.type === "number",
              onChange: () => {
                if (
                  collection === "materials" &&
                  (field.key === "cost" || field.key === "margin")
                ) {
                  const price = calcularVenda(
                    Number(form.getValues("cost")),
                    Number(form.getValues("margin")),
                  )
                  form.setValue(
                    "salePrice",
                    Number.isFinite(price) ? price : "",
                    { shouldValidate: form.formState.isSubmitted },
                  )
                }
              },
            })}
            aria-invalid={!!error}
          />
        )}
        {error && (
          <FieldError id={`${id}-error`}>{String(error.message)}</FieldError>
        )}
      </Field>
    )
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !form.formState.isSubmitting) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={
          collection === "orders" ||
          collection === "clients" ||
          collection === "materials"
            ? "max-h-[90dvh] overflow-y-auto sm:max-w-3xl"
            : "max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        }
        finalFocus={() => {
          returnFocus()
          return false
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Os campos com * são obrigatórios.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={form.handleSubmit(submit)}
          className="space-y-6"
        >
          <fieldset
            disabled={form.formState.isSubmitting}
            className="space-y-6"
          >
            {/* O grid usa breakpoints de viewport; sem contenção, os campos mantêm a altura ao inserir componentes no diálogo. */}
            <div className="grid gap-5 sm:grid-cols-2">
              {fields[collection].map(renderField)}
            </div>
            {collection === "materials" && (
              <p
                id="explicacao-preco"
                className="text-sm text-muted-foreground"
              >
                Margem sobre o preço de venda. Venda = custo ÷ (1 − margem ÷
                100). O preço é calculado automaticamente, por unidade de
                estoque, sem incluir impostos ou despesas adicionais.
              </p>
            )}
            {collection === "materials" &&
              values.category === "Produto pronto" &&
              values.kind !== "Comprado" && (
                <section
                  aria-label="Composição do produto"
                  className="space-y-4 rounded-lg border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-medium">
                        Matérias-primas e componentes
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Quantidades para produzir 1 {values.unit} deste produto.
                        Use a unidade de estoque de cada componente.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        components.append({ materialId: "", quantity: 1 })
                      }
                      disabled={components.fields.length >= 100}
                    >
                      <Plus />
                      Adicionar componente
                    </Button>
                  </div>
                  {!componentOptions.length && (
                    <p className="text-sm text-muted-foreground">
                      Cadastre primeiro as matérias-primas ou componentes em
                      Saldos.
                    </p>
                  )}
                  {components.fields.map((item, index) => (
                    <div
                      key={item.id}
                      className="grid items-start gap-3 sm:grid-cols-[2fr_1fr_auto]"
                    >
                      {renderField({
                        key: `components.${index}.materialId`,
                        label: `Componente ${index + 1}`,
                        options: componentOptions,
                      })}
                      {renderField({
                        key: `components.${index}.quantity`,
                        label: `Quantidade ${index + 1}`,
                        type: "number",
                      })}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="sm:mt-6"
                        aria-label={`Remover componente ${index + 1}`}
                        onClick={() => components.remove(index)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  {form.formState.errors.components && (
                    <FieldError>
                      Revise a composição: selecione componentes distintos e
                      quantidades maiores que zero.
                    </FieldError>
                  )}
                  <p className="text-sm font-medium">
                    Custo dos componentes:{" "}
                    {brl(
                      (values.components ?? []).reduce(
                        (
                          sum: number,
                          item: { materialId: string; quantity: number },
                        ) =>
                          sum +
                          (Number.isFinite(item.quantity)
                            ? (db.materials.find(
                                (row) => row.id === item.materialId,
                              )?.cost ?? 0) * item.quantity
                            : 0),
                        0,
                      ),
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Este subtotal não inclui mão de obra ou outras despesas.
                    Informe o custo total no campo Preço de custo.
                  </p>
                </section>
              )}
            {collection === "clients" && (
              <section aria-label="Endereços" className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-medium">Endereço e localização</h3>
                    <p className="text-sm text-muted-foreground">
                      Principal obrigatório. Entrega, cobrança e residencial são
                      opcionais.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={addresses.fields.length >= 4}
                    onClick={() =>
                      addresses.append({
                        type:
                          addressTypes.find(
                            (type) =>
                              !(values.addresses ?? []).some(
                                (address: { type: string }) =>
                                  address.type === type,
                              ),
                          ) ?? "Entrega",
                        zip: "",
                        street: "",
                        neighborhood: "",
                      })
                    }
                  >
                    <Plus />
                    Adicionar endereço
                  </Button>
                </div>
                {addresses.fields.map((address, index) => (
                  <div
                    key={address.id}
                    className="space-y-4 rounded-md border p-4"
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">
                        Endereço {index + 1}
                      </h4>
                      {index > 0 && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Remover endereço ${index + 1}`}
                          onClick={() => addresses.remove(index)}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                    <FieldGroup className="grid gap-4 sm:grid-cols-2">
                      {renderField({
                        key: `addresses.${index}.type`,
                        label: "Tipo de endereço",
                        options: addressTypes.map((type) => ({
                          value: type,
                          label: type,
                          disabled:
                            index === 0
                              ? type !== "Principal (faturamento)"
                              : (values.addresses ?? []).some(
                                  (row: { type: string }, i: number) =>
                                    i !== index && row.type === type,
                                ),
                        })),
                      })}
                      {renderField({
                        key: `addresses.${index}.zip`,
                        label: "CEP",
                      })}
                      {renderField({
                        key: `addresses.${index}.street`,
                        label: "Rua",
                      })}
                      {renderField({
                        key: `addresses.${index}.neighborhood`,
                        label: "Bairro",
                      })}
                    </FieldGroup>
                  </div>
                ))}
                {form.formState.errors.addresses && (
                  <FieldError>
                    Revise os endereços: informe CEP, rua e bairro e mantenha um
                    único endereço de cada tipo, incluindo o principal.
                  </FieldError>
                )}
              </section>
            )}
            {collection === "transactions" &&
              !fields.transactions.find((field) => field.key === "partyId")
                ?.options?.length && (
                <p className="text-sm text-muted-foreground">
                  Cadastre um{" "}
                  {values.type === "Receber" ? "cliente" : "fornecedor"} em
                  Cadastros antes de criar o lançamento.
                </p>
              )}
            {collection === "orders" && (
              <section aria-label="Itens do pedido" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Itens do pedido</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      items.append({ productId: "", quantity: 1, price: 0 })
                    }
                  >
                    <Plus />
                    Adicionar item
                  </Button>
                </div>
                {items.fields.map((item, index) => (
                  <div
                    className="grid gap-4 rounded-md border p-4 sm:grid-cols-[2fr_1fr_1fr_auto]"
                    key={item.id}
                  >
                    {renderField({
                      key: `items.${index}.productId`,
                      label: `Produto ${index + 1}`,
                      options: productOptions,
                    })}
                    {renderField({
                      key: `items.${index}.quantity`,
                      label: "Quantidade",
                      type: "number",
                    })}
                    {renderField({
                      key: `items.${index}.price`,
                      label: "Preço (R$)",
                      type: "number",
                    })}
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      className="sm:mt-7"
                      aria-label={`Remover item ${index + 1}`}
                      onClick={() => items.remove(index)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                {form.formState.errors.items && (
                  <FieldError>
                    Revise os itens: selecione produtos distintos, quantidades
                    inteiras maiores que zero e preços positivos com até duas
                    casas decimais.
                  </FieldError>
                )}
                <p className="text-right font-medium">
                  Total:{" "}
                  {brl(
                    (values.items ?? []).reduce(
                      (
                        total: number,
                        item: { quantity: number; price: number },
                      ) =>
                        total +
                        (Number.isFinite(item.price) &&
                        Number.isFinite(item.quantity)
                          ? (Math.round(item.price * 100) * item.quantity) / 100
                          : 0),
                      0,
                    ),
                  )}
                </p>
              </section>
            )}
            {form.formState.errors.root?.server && (
              <Alert variant="destructive">
                <AlertDescription>
                  {String(form.formState.errors.root.server.message)}
                </AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button variant="outline" type="button" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit">
                {form.formState.isSubmitting ? "Salvando…" : "Salvar"}
              </Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  )
}
