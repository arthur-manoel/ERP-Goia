import { lotesHandler } from "@/modules/producao/lotes.router"
export const GET = lotesHandler("consultar")
export const POST = lotesHandler("enviar")
