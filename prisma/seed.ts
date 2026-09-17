import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const { prisma } = await import("../src/lib/prisma");

  try {
    for (const usuario of [
      { nome: "Bolsista Exemplo", email: "bolsista@example.test" },
      { nome: "Pessoa Demonstração", email: "demo@example.test" },
    ]) {
      await prisma.usuario.upsert({
        where: { email: usuario.email },
        update: {},
        create: usuario,
      });
    }
    console.log("Seed concluído: dois usuários fictícios disponíveis.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
