import { readJson, readQuery } from "../../../lib/api/http"
import { catalogRequest } from "../../../../modules/catalogos/access"
import { createCor, listCores } from "../../../../modules/cores/service"
export const runtime = "nodejs"
export async function GET(request: Request) {
  return catalogRequest(request, "CORES", "pode_ler", (companies) =>
    listCores(readQuery(request), companies),
  )
}
export async function POST(request: Request) {
  return catalogRequest(
    request,
    "CORES",
    "pode_criar",
    async (companies) => createCor(await readJson(request), companies),
    201,
  )
}
