import { expect, it } from "vitest";
import { createCorSchema, updateCorSchema } from "../../../modules/cores/schema";
it("aceita hex omitido ou nulo e normaliza seis dígitos", () => {
  expect(createCorSchema.parse({ id_empresa: 1, nome: "Azul" })).toEqual({ id_empresa: 1, nome: "Azul", status: "ATIVA" });
  expect(updateCorSchema.parse({ codigo_hex: " #aabb00 " })).toEqual({ codigo_hex: "#AABB00" });
  expect(updateCorSchema.parse({ codigo_hex: null })).toEqual({ codigo_hex: null });
});
it("limita nome ao varchar real", () => {
  expect(createCorSchema.safeParse({ id_empresa: 1, nome: "a".repeat(100) }).success).toBe(true);
  expect(createCorSchema.safeParse({ id_empresa: 1, nome: "a".repeat(101) }).success).toBe(false);
});
