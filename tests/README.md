# Testes unitários

```text
tests/
  setup.ts                       # Prisma mockado e ambiente isolado de teste
  helpers/
    prisma.ts                    # Doubles dos models e transações
    http.ts                      # Requisições com cookies e params do App Router
  unit/
    auth/
      routes.test.ts             # Login, refresh, logout e me
      tokens.test.ts             # Assinatura, expiração, adulteração e segredo
      proxy.test.ts              # Proteção global e redirecionamento
      client.test.ts             # Renovação única, reenvio do corpo e falhas
      rate-limit.test.ts         # Tentativas e janela de bloqueio
    tamanhos/
      routes.test.ts             # CRUD, HTTP, escopo por empresa e falhas Prisma
      schema.test.ts             # Limites e nullabilidade da tabela real
    produtos/
      auth.test.ts               # Proteção das rotas existentes
      schema.test.ts             # Validações já existentes, agora centralizadas
```

- `npm test`: suíte completa, execução única.
- `npm run test:watch`: modo de desenvolvimento.
- `npm test -- tests/unit/tamanhos`: somente o módulo escolhido.

Os testes de rotas chamam os handlers reais com Requests, cookies e params; passam
pelo service e repository reais, usando doubles apenas para o Prisma. Isso permite
verificar respostas JSON, códigos HTTP, parâmetros das queries e ausência de
consultas não autorizadas. Os testes de refresh simulam consumo condicional,
reutilização e perda da disputa por rotação; não substituem um teste de concorrência
com MySQL real. Não leem `.env.local`, não usam credenciais reais e não gravam no banco.

A conexão Prisma é substituída no setup antes dos imports da aplicação. O segredo
JWT de teste não deve ser usado fora da suíte. Todas as funções mockadas são
reiniciadas antes de cada teste.
