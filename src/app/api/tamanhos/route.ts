import { authenticated } from "../../../lib/auth/http";
import { readJson, readQuery } from "../../../lib/api/http";
import { createTamanho, listTamanhos } from "../../../lib/tamanhos/service";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return authenticated(request, (user) => listTamanhos(readQuery(request), user.id));
}
export async function POST(request: Request) {
  return authenticated(request, async (user) => createTamanho(await readJson(request), user.id), 201);
}
