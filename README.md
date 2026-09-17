# ERP Goia — desenvolvimento local

Repositório único Next.js 16, React 19 e TypeScript 5, com App Router em src/app. Prisma acessa MySQL no servidor do próprio Next.js, sem backend separado.

## Requisitos

- Node.js 24 LTS (também aceitos: ^20.19 ou ^22.12).
- npm e MySQL 8.0+ local, normalmente na porta 3306.
- Acesso administrativo ao MySQL para criar bancos e usuário local.

Prisma CLI, Client e adaptador MariaDB estão fixados na versão estável 7.10.0. O adaptador oficial MariaDB atende MySQL e é necessário no Prisma 7.

## Do zero

1. Clone e entre no repositório.
2. Copie `.env.example` para `.env.local` na raiz: `Copy-Item .env.example .env.local` (PowerShell) ou `cp .env.example .env.local` (Linux/macOS). Faça isso antes de instalar: a configuração exige DATABASE_URL para gerar o cliente, mas essa geração não abre conexão.
3. No MySQL, como administrador local, execute (substitua a senha por uma exclusivamente local):

```sql
CREATE DATABASE erp_goia_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE erp_goia_shadow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'erp_goia_dev'@'localhost' IDENTIFIED BY 'SENHA_LOCAL_AQUI';
GRANT ALL PRIVILEGES ON erp_goia_dev.* TO 'erp_goia_dev'@'localhost';
GRANT ALL PRIVILEGES ON erp_goia_shadow.* TO 'erp_goia_dev'@'localhost';
```

4. Ajuste usuário, senha e porta no `.env.local`:

```dotenv
DATABASE_URL="mysql://erp_goia_dev:SENHA_LOCAL_AQUI@127.0.0.1:3306/erp_goia_dev"
SHADOW_DATABASE_URL="mysql://erp_goia_dev:SENHA_LOCAL_AQUI@127.0.0.1:3306/erp_goia_shadow"
```

Codifique caracteres especiais de usuário/senha para URL (por exemplo, @ vira %40). O shadow database deve ser outro banco, descartável: Prisma pode limpar seu conteúdo para validar migrations. As permissões acima dispensam concessões globais. Se omitir SHADOW_DATABASE_URL, o usuário precisa de permissões para criação e remoção automática do banco shadow.

5. Execute:

```bash
npm ci
npx prisma validate
npx prisma migrate dev
npm run seed
npm run dev
```

Abra [localhost:3000](http://localhost:3000). A instalação gera o cliente automaticamente. No Prisma 7, migrate dev não executa seed nem regenera o cliente: após futuras alterações do schema, execute também `npm run db:generate`.

## Dados e integração

Usuario é uma entidade mínima para validar persistência, sem autenticação ou modelo completo do ERP. O seed cria bolsista@example.test e demo@example.test, totalmente fictícios. Pode ser repetido sem duplicar registros nem sobrescrever edições existentes. Nenhum bolsista precisa de dumps, credenciais ou dados reais da empresa.

`src/lib/prisma.ts` exporta prisma e reutiliza uma instância durante hot reload. Importe por caminho relativo adequado somente em Server Components, Server Actions ou Route Handlers. O módulo usa server-only e requer runtime Node.js, não Edge. O seed ativa a condição react-server para reutilizar o mesmo cliente fora do Next.js.

Next.js carrega as variáveis automaticamente; CLI e seed usam @next/env para seguir a mesma ordem, incluindo .env.local. Variáveis já definidas no processo têm precedência. Nunca use NEXT_PUBLIC_ para credenciais.

## Comandos

| Comando | Finalidade |
| --- | --- |
| npm run dev | Desenvolvimento Next.js |
| npm run build | Build de produção |
| npm start | Servir o build |
| npm run lint | ESLint |
| npm run db:generate | Gerar Prisma Client |
| npm run db:migrate -- --name nome_da_mudanca | Criar/aplicar migration |
| npm run db:status | Consultar migrations |
| npm run seed | Seed fictício idempotente |

Validação: npm ci, npx prisma validate, npx prisma migrate dev, npm run seed, npm run db:status, npm run lint e npm run build. O seed também exercita o Prisma Client no MySQL.

Versione schema, configuração, seed, toda a pasta prisma/migrations e package-lock.json. Não versione .env.local, demais .env* (exceto .env.example), node_modules ou src/generated/prisma.

Erro de autenticação: confira credenciais e permissões MySQL. Erro de conexão: confira serviço, host e porta. Erro de shadow database: confira a segunda URL e suas permissões. Não use migrate reset em bancos com dados que deseja preservar.

Referências: [MySQL no Prisma](https://docs.prisma.io/docs/orm/v7/core-concepts/supported-databases/mysql) e [configuração Prisma](https://docs.prisma.io/docs/orm/reference/prisma-config-reference).
