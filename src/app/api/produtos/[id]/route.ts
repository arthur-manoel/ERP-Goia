import { getProduto, updateProduto, deleteProduto } from "../../../../lib/produtos/service";
import { handleRequest, readJson } from "../../../../lib/produtos/http";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return handleRequest(request, async () => getProduto((await context.params).id));
}

export async function PUT(request: Request, context: Context) {
  return handleRequest(request, async () => updateProduto((await context.params).id, await readJson(request)));
}

export async function DELETE(request: Request, context: Context) {
  return handleRequest(request, async () => deleteProduto((await context.params).id));
}
