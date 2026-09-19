import { expect, it, vi } from "vitest";
import { limitLogin } from "../../../src/lib/auth/rate-limit";
it("bloqueia a décima primeira tentativa por email e libera após a janela", () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
  for (let i = 0; i < 10; i++) limitLogin("limite@example.test");
  expect(() => limitLogin("LIMITE@example.test")).toThrow("Muitas tentativas");
  clock.mockReturnValue(1_000_000 + 15 * 60_000);
  expect(() => limitLogin("limite@example.test")).not.toThrow();
});
