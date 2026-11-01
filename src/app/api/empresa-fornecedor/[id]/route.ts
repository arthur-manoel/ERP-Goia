export const runtime = "nodejs"
export {
  getHandler as GET,
  updateHandler as PUT,
  patchHandler as PATCH,
  deleteHandler as DELETE,
} from "@/modules/empresa-fornecedor/router"
