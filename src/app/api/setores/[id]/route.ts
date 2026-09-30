import { handler } from "@/modules/fluxos/router"
export const GET = handler("setor", "consultar")
export const PATCH = handler("setor", "editar")
export const DELETE = handler("setor", "excluir")
