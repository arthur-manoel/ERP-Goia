import { handler } from "@/modules/fluxos/router"
export const PUT = handler("fluxo", "associar")
export const DELETE = handler("fluxo", "desassociar")
export const GET = handler("fluxo", "consultarAssociacao")
