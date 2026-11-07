import { handler } from "@/modules/apontamentos/router"
export const runtime = "nodejs"
export const GET = handler("consultar")
export const POST = handler("registrar")
