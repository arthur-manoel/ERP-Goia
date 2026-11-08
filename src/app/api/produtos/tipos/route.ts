import { readQuery } from "@/lib/api/http"
import { catalogRequest } from "../../../../../modules/catalogos/access"
import { listTiposProduto } from "../../../../../modules/tipos_produto/service"

export const runtime = "nodejs"

export function GET(request: Request) {
  return catalogRequest(
    request,
    "PRODUTOS",
    "pode_ler",
    async () => {
      const pagina = await listTiposProduto(readQuery(request))
      return {
        ...pagina,
        rows: pagina.rows.map(({ id, nome, status }) => ({ id, nome, status })),
      }
    },
    200,
    { scope: "produtos:tipos", limit: 120, windowMs: 60_000 },
  )
}
