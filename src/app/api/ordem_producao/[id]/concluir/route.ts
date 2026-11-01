export const runtime = "nodejs"
import { actionHandler } from "@/modules/producao/ordem.router"
export const POST = actionHandler("concluir")
