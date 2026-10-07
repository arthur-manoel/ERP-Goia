import { z } from "zod"
import { texto } from "@/features/erp/validacao"
import { cnpjValido, cpfValido, normalizarDocumento } from "./documentos"

export const tiposEndereco = [
  "Principal (faturamento)",
  "Entrega",
  "Cobrança",
  "Residencial",
] as const

export const enderecoSchema = z.object({
  type: z.enum(tiposEndereco),
  zip: z
    .string()
    .trim()
    .regex(/^\d{5}-?\d{3}$/, "Informe um CEP com 8 dígitos.")
    .transform((value) => value.replace("-", "")),
  street: texto("Rua"),
  neighborhood: texto("Bairro"),
})

export const clienteSchema = z
  .object({
    name: texto("Nome", 3),
    email: z.string().trim().email("Informe um e-mail válido."),
    phone: z
      .string()
      .trim()
      .refine((value) => {
        const digits = value.replace(/\D/g, "")
        return (
          /^[\d\s()+-]+$/.test(value) &&
          (digits.length === 10 || digits.length === 11)
        )
      }, "Informe telefone com DDD, com 10 ou 11 dígitos."),
    status: z.enum(["Ativo", "Inativo"]),
    role: z.enum(["Cliente", "Fornecedor", "Cliente e fornecedor"]),
    personType: z.enum(["PF", "PJ"]),
    document: z
      .string()
      .trim()
      .min(1, "Informe o CPF ou CNPJ.")
      .transform(normalizarDocumento),
    addresses: z
      .array(enderecoSchema)
      .min(1, "Informe o endereço principal.")
      .max(4, "Use até quatro tipos de endereço."),
  })
  .superRefine((data, ctx) => {
    if (
      !(data.personType === "PF"
        ? cpfValido(data.document)
        : cnpjValido(data.document))
    )
      ctx.addIssue({
        code: "custom",
        path: ["document"],
        message: `Informe um ${data.personType === "PF" ? "CPF" : "CNPJ"} válido.`,
      })
    if (
      !data.addresses.some(
        (address) => address.type === "Principal (faturamento)",
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["addresses"],
        message: "Mantenha um endereço principal (faturamento).",
      })
    const encontrados = new Set<string>()
    data.addresses.forEach((address, index) => {
      if (encontrados.has(address.type))
        ctx.addIssue({
          code: "custom",
          path: ["addresses", index, "type"],
          message: "Este tipo de endereço já foi informado.",
        })
      encontrados.add(address.type)
    })
  })

export type Cliente = z.infer<typeof clienteSchema> & { id: string }
