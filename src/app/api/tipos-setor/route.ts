import { tiposSetor } from "@/modules/fluxos/setor-config.router"
export const GET = (request: Request) => tiposSetor.listar(request)
export const POST = (request: Request) => tiposSetor.criar(request)
