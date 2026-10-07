import { handler } from "@/modules/fluxos/router"
export const GET = handler("fluxo", "consultar")
export const PATCH = handler("fluxo", "editar")
export const DELETE = handler("fluxo", "excluir")
