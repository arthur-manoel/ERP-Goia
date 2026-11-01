export const runtime = "nodejs"
export {
  getHandler as GET,
  updateHandler as PUT,
  patchHandler as PATCH,
  cancelHandler as DELETE,
} from "@/modules/producao/ordem.router"
