export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export {
  listarHandler as GET,
  criarHandler as POST,
} from "@/modules/pedidos/router"
