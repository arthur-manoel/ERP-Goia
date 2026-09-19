import { expect, it } from "vitest";
import { createTamanhoSchema, updateTamanhoSchema } from "../../../src/lib/tamanhos/schema";
it("segue os limites e defaults da tabela real", () => {
  expect(createTamanhoSchema.parse({ id_empresa: 1, nome: " M " })).toEqual({ id_empresa: 1, nome: "M", ordem: 0, status: "ATIVO" });
  expect(createTamanhoSchema.safeParse({ id_empresa: 1, nome: "x".repeat(50), descricao: "x".repeat(255) }).success).toBe(true);
  expect(createTamanhoSchema.safeParse({ id_empresa: 1, nome: "M", descricao: "x".repeat(256) }).success).toBe(false);
});
it("aceita descrição nula e ordem inteira assinada, mas não ordem nula", () => {
  expect(updateTamanhoSchema.parse({ descricao: null, ordem: -2 })).toEqual({ descricao: null, ordem: -2 });
  expect(updateTamanhoSchema.safeParse({ ordem: null }).success).toBe(false);
  expect(updateTamanhoSchema.safeParse({ ordem: 2_147_483_648 }).success).toBe(false);
});
