import type { Prisma } from "@/generated/prisma/client"
import type {
  detalhe,
  listar,
  previa,
} from "@/modules/cancelamentos/cancelamentos.service"
type Serializado<T> = T extends Date
  ? string
  : T extends Prisma.Decimal
    ? string
    : T extends (infer I)[]
      ? Serializado<I>[]
      : T extends object
        ? { [K in keyof T]: Serializado<T[K]> }
        : T
export type DetalheCancelamento = Serializado<
  Awaited<ReturnType<typeof detalhe>>
>
export type ListaCancelamentos = Serializado<Awaited<ReturnType<typeof listar>>>
export type PreviaCancelamento = Serializado<Awaited<ReturnType<typeof previa>>>
