import { handleRequest, readJson, readQuery } from "../../../lib/api/http"
import { createCor, listCores } from "../../../../modules/cores/service"
export const runtime = "nodejs"
export async function GET(request: Request) {
  return handleRequest(() => listCores(readQuery(request)))
}
export async function POST(request: Request) {
  return handleRequest(async () => createCor(await readJson(request)), 201)
}
