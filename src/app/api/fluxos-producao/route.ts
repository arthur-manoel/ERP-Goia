import { handler } from "@/modules/fluxos/router"
export const GET = (request: Request) => handler("fluxo", "listar")(request)
export const POST = (request: Request) => handler("fluxo", "criar")(request)
