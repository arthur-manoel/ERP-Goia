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
import { schemas, type Collection, type Data } from "@/features/erp/tipos"
import { unidades, calcularVenda } from "@/features/estoque/schemas"
import { tiposEndereco as addressTypes } from "@/features/clientes/schemas"
import {
  formatarCep,
  formatarDocumento,
  formatarTelefone,
} from "@/features/clientes/formatacao"
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
import { FormularioPedido } from "@/features/pedidos/components/formulario-pedido"
import { FormularioAberturaOP } from "@/features/producao/components/formulario-abertura-op"

type FormField = {
  key: string
  label: string
  type?: "number" | "email" | "date" | "tel" | "textarea"
  readOnly?: boolean
  optional?: boolean
  options?: Option[]
  mask?: "document" | "phone" | "zip"
}
const options = (values: string[]) =>
  values.map((value) => ({ value, label: value }))
type RecordFormProps = {
  collection: Collection
  initial: FieldValues
  title: string
  onClose: () => void
  returnFocus: () => void
}

export function RecordForm(props: RecordFormProps) {
  if (props.collection === "orders") return <FormularioPedido {...props} />
  if (props.collection === "productions")
    return <FormularioAberturaOP {...props} />
  return <FormularioRegistro {...props} />
}

function FormularioRegistro({
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

  const variations = useFieldArray({
    control: form.control,
    name: "variations",
  })
  const addresses = useFieldArray({ control: form.control, name: "addresses" })
  const values = useWatch({ control: form.control })
  const db = data as Data
  const componentOptions = db.materials
    .filter((row) => row.id !== initial.id)
    .map((row) => ({ value: row.id, label: row.name + " · " + row.unit }))
  const fields: Partial<Record<Collection, FormField[]>> = {
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
      {
        key: "document",
        label: values.personType === "PJ" ? "CNPJ" : "CPF",
        mask: "document",
      },
      {
        key: "role",
        label: "Perfil do cadastro",
        options: options(["Cliente", "Fornecedor", "Cliente e fornecedor"]),
      },
      { key: "name", label: "Nome / razão social" },
      { key: "email", label: "E-mail", type: "email" },
      { key: "phone", label: "Telefone com DDD", type: "tel", mask: "phone" },
      {
        key: "status",
        label: "Situação",
        options: options(["Ativo", "Inativo"]),
      },
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
  function formatarCampo(mask: FormField["mask"], value: unknown) {
    const texto = typeof value === "string" ? value : ""
    if (mask === "document")
      return formatarDocumento(texto, values.personType === "PJ" ? "PJ" : "PF")
    if (mask === "phone") return formatarTelefone(texto)
    if (mask === "zip") return formatarCep(texto)
    return texto
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
                    field.key === "category" &&
                    value !== "Produto pronto"
                  )
                    variations.replace([])
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
        ) : field.mask ? (
          <Controller
            control={form.control}
            name={field.key}
            render={({ field: control }) => (
              <Input
                id={id}
                ref={control.ref}
                name={control.name}
                type={field.type ?? "text"}
                value={formatarCampo(field.mask, control.value)}
                onChange={(event) =>
                  control.onChange(
                    formatarCampo(field.mask, event.target.value),
                  )
                }
                onBlur={control.onBlur}
                inputMode={
                  field.mask === "document" && values.personType === "PJ"
                    ? "text"
                    : "numeric"
                }
                maxLength={
                  field.mask === "document"
                    ? values.personType === "PJ"
                      ? 18
                      : 14
                    : field.mask === "phone"
                      ? 15
                      : 9
                }
                autoComplete={
                  field.mask === "phone"
                    ? "tel"
                    : field.mask === "zip"
                      ? "postal-code"
                      : "off"
                }
                aria-invalid={!!error}
                aria-describedby={error ? `${id}-error` : undefined}
              />
            )}
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
              {(fields[collection] ?? []).map(renderField)}
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
              values.category === "Produto pronto" && (
                <section
                  aria-label="Variações do produto"
                  className="space-y-4 rounded-lg border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-medium">
                        Tamanhos e cores (opcional)
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Cadastre as combinações vendidas por unidade ou peça. A
                        soma dos saldos deve corresponder ao saldo atual do
                        produto.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={variations.fields.length >= 100}
                      onClick={() =>
                        variations.append({
                          id: crypto.randomUUID(),
                          size: "",
                          color: "",
                          quantity: 0,
                        })
                      }
                    >
                      <Plus />
                      Adicionar variação
                    </Button>
                  </div>
                  {variations.fields.map((variacao, index) => (
                    <div
                      key={variacao.id}
                      className="grid items-start gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
                    >
                      {renderField({
                        key: `variations.${index}.size`,
                        label: "Tamanho",
                      })}
                      {renderField({
                        key: `variations.${index}.color`,
                        label: "Cor",
                      })}
                      {renderField({
                        key: `variations.${index}.quantity`,
                        label: "Saldo",
                        type: "number",
                      })}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="sm:mt-7"
                        aria-label={`Remover variação ${index + 1}`}
                        onClick={() => variations.remove(index)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  {form.formState.errors.variations && (
                    <FieldError>
                      Revise tamanhos, cores e saldos. Use combinações únicas e
                      quantidades inteiras em um produto medido em unidades ou
                      peças.
                    </FieldError>
                  )}
                </section>
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
                        mask: "zip",
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
              !fields.transactions?.find((field) => field.key === "partyId")
                ?.options?.length && (
                <p className="text-sm text-muted-foreground">
                  Cadastre um{" "}
                  {values.type === "Receber" ? "cliente" : "fornecedor"} em
                  Cadastros antes de criar o lançamento.
                </p>
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
