export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export {
  consultarHandler as GET,
  editarHandler as PATCH,
} from "@/modules/pedidos/router"
