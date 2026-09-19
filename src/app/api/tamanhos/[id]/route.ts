import { authenticated } from "../../../../lib/auth/http";
import { readJson } from "../../../../lib/api/http";
import { getTamanho, updateTamanho, deleteTamanho } from "../../../../lib/tamanhos/service";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return authenticated(request, async (user) => getTamanho((await context.params).id, user.id));
}
export async function PUT(request: Request, context: Context) {
  return authenticated(request, async (user) => updateTamanho((await context.params).id, await readJson(request), user.id));
}
export async function DELETE(request: Request, context: Context) {
  return authenticated(request, async (user) => deleteTamanho((await context.params).id, user.id));
}
