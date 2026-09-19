import { handleRequest, readJson, readQuery } from "../../../lib/api/http";
import { createTamanho, listTamanhos } from "../../../lib/tamanhos/service";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handleRequest( () => listTamanhos(readQuery(request)));
}
export async function POST(request: Request) {
  return handleRequest( async () => createTamanho(await readJson(request)), 201);
}
