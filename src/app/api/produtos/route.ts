import { type NextRequest } from "next/server";
import { createProduto, listProdutos, ValidationError } from "../../../lib/produtos/service";
import { handleRequest, readJson } from "../../../lib/produtos/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return handleRequest( async () => {
    const query: Record<string, string> = {};
    for (const [key, value] of request.nextUrl.searchParams) {
      if (Object.hasOwn(query, key)) throw new ValidationError(`Parâmetro repetido: ${key}.`);
      Object.defineProperty(query, key, { value, enumerable: true });
    }
    return listProdutos(query);
  });
}

export async function POST(request: Request) {
  return handleRequest( async () => createProduto(await readJson(request)), 201);
}
