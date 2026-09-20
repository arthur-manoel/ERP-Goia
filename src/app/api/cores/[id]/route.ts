import { handleRequest, readJson } from "../../../../lib/api/http";
import { getCor, updateCor, deleteCor } from "../../../../../modules/cores/service";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return handleRequest( async () => getCor((await context.params).id));
}
export async function PUT(request: Request, context: Context) {
  return handleRequest( async () => updateCor((await context.params).id, await readJson(request)));
}
export async function DELETE(_request: Request, context: Context) {
  return handleRequest( async () => deleteCor((await context.params).id));
}
