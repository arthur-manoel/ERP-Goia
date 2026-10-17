import { handler } from "@/modules/fluxos/router"
export const GET = (request: Request) => handler("setor", "listar")(request)
export const POST = (request: Request) => handler("setor", "criar")(request)
