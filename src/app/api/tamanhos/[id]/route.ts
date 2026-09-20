import { handleRequest, readJson } from "../../../../lib/api/http";
import { getTamanho, updateTamanho, deleteTamanho } from "../../../../../modules/tamanhos/service";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return handleRequest( async () => getTamanho((await context.params).id));
}
export async function PUT(request: Request, context: Context) {
  return handleRequest( async () => updateTamanho((await context.params).id, await readJson(request)));
}
export async function DELETE(_request: Request, context: Context) {
  return handleRequest( async () => deleteTamanho((await context.params).id));
}
