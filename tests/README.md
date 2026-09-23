# Testes unitários

- tests/helpers: requisições HTTP e doubles do Prisma.
- tests/setup.ts: isolamento do banco antes dos imports da aplicação.
- tests/unit/produtos: validação e rotas públicas de produtos.
- tests/unit/tamanhos: validação, CRUD, filtros e paginação de tamanhos.
- tests/unit/cores: validação hexadecimal, CRUD, filtros e paginação de cores.

Execute npm test para a suíte completa, npm run test:watch durante o desenvolvimento
ou npm test -- tests/unit/cores para um módulo específico.

Os testes invocam os handlers, services e repositories reais, simulando apenas
as operações Prisma. Não leem credenciais e não gravam no banco. As requisições
não precisam de cookies. Constraints MySQL e concorrência real requerem testes
de integração em banco separado.
