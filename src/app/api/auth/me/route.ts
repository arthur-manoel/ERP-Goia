import { authenticated } from "../../../../lib/auth/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return authenticated(request, async (usuario) => ({ usuario }));
}
