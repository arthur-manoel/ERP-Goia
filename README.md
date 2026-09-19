# ERP Goia

ERP multiempresa com cadastros, estoque, compras, entrada de notas fiscais, produção e vendas. Aplicação única em Next.js (App Router) que acessa o MySQL direto pelo servidor via Prisma, sem backend separado.

> **Este README é o painel de acompanhamento do projeto.** Ao concluir uma feature, atualize o [status dos módulos](#status-dos-módulos), o [roadmap](#roadmap) e o [histórico](#histórico) no mesmo PR.

---

## Sumário

- [Status dos módulos](#status-dos-módulos)
- [Roadmap](#roadmap)
- [Stack](#stack)
- [Como rodar](#como-rodar)
- [Banco de dados (DB-first)](#banco-de-dados-db-first)
- [Componentes de UI (shadcn)](#componentes-de-ui-shadcn)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Scripts](#scripts)
- [Git Flow](#git-flow)
- [Pendências e decisões](#pendências-e-decisões)
- [Histórico](#histórico)

---

## Status dos módulos

Legenda: ⬜ não iniciado · 🟨 em andamento · ✅ concluído · ⛔ bloqueado

| Módulo | Status | Tabelas do banco | Responsável | Branch/PR |
| --- | :---: | --- | --- | --- |
| Infraestrutura (Next, Prisma, shadcn, Git Flow) | ✅ | — | Arthur / Everton | `feature/prisma-db-pull`, `feature/shadcn-components` |
| Acesso e segurança | 🟨 | `usuarios`, `refresh_tokens`, `administradores_gerais`, `usuario_empresa`, `cargos`, `permissoes_usuario`, `permissoes_setor` | — | — |
| Empresas e estrutura | ⬜ | `empresas`, `setores`, `tipos_setor`, `sequencias_automaticas` | — | — |
| Auditoria | ⬜ | `auditoria` | — | — |
| Cadastros básicos | ⬜ | `clientes`, `fornecedores`, `empresa_fornecedor`, `categorias`, `cores`, `tamanhos`, `tipos_produto` | — | — |
| Produtos e ficha técnica | ⬜ | `produtos`, `produto_empresa`, `produto_variacoes`, `produto_fornecedor`, `ficha_tecnica`, `ficha_tecnica_item` | — | — |
| Estoque | ⬜ | `locais_estoque`, `estoque`, `movimentacao_estoque`, `kardex`, `reserva_estoque` | — | — |
| Compras | ⬜ | `requisicao_compra`, `item_requisicao_compra`, `pedido_compra`, `item_pedido_compra`, `compras`, `compra_itens` | — | — |
| Notas fiscais de entrada | ⬜ | `nota_fiscal`, `item_nota_fiscal` | — | — |
| Produção | ⬜ | `ordem_producao`, `ordem_producao_item`, `ordem_producao_consumo_planejado`, `ordem_producao_fluxo_setor`, `ordem_producao_movimentacao_setor`, `ordem_producao_movimentacao_item`, `necessidade_producao`, `consumo_producao` | — | — |
| Vendas | ⬜ | `venda`, `item_venda` | — | — |

As 48 tabelas do banco `joseev47_erp_dev` estão distribuídas acima; cada uma aparece em um único módulo.

---

## Roadmap

### Fase 0 — Infraestrutura ✅

- [x] Next.js 16 + React 19 + TypeScript + Tailwind CSS 4
- [x] Prisma 7 com adapter MariaDB conectado ao MySQL `joseev47_erp_dev`
- [x] Schema introspectado do banco (48 models, 38 enums)
- [x] shadcn/ui com todos os componentes do style `base-nova`
- [x] Git Flow com `main` e `develop`
- [x] README de acompanhamento

### Fase 1 — Base da aplicação

- [ ] Layout principal (sidebar, header, seletor de empresa)
- [ ] `ThemeProvider` (next-themes), `TooltipProvider` e `Toaster` no layout raiz
- [ ] Autenticação integrada (login, JWT, refresh token, logout)
- [x] Helpers Argon2id, JWT de 15 minutos, refresh com rotação e RBAC por Bearer token
- [ ] Conectar adapter de autenticação à persistência e definir mapeamento dos quatro perfis
- [ ] Controle de acesso por nível, setor e permissão de recurso
- [ ] Contexto multiempresa (todas as consultas filtradas por `id_empresa`)
- [ ] Registro de auditoria nas operações de escrita

### Fase 2 — Cadastros

- [ ] Empresas, setores e tipos de setor
- [ ] Usuários, cargos e vínculo usuário × empresa
- [ ] Clientes e fornecedores
- [ ] Categorias, cores, tamanhos e tipos de produto
- [ ] Produtos, variações, dados por empresa e fornecedores do produto
- [ ] Ficha técnica (versões e componentes)

### Fase 3 — Operação

- [ ] Estoque: locais, saldos, movimentações, kardex e reservas
- [ ] Compras: requisição → pedido → compra
- [ ] Entrada de nota fiscal (itens, vínculo com pedido/compra, processamento no estoque)
- [ ] Produção: ordem de produção, necessidades, consumo, fluxo e movimentação entre setores
- [ ] Vendas: pedido de venda, itens e reserva de estoque

### Fase 4 — Entrega

- [ ] Dashboards e relatórios
- [ ] Testes automatizados dos fluxos críticos (estoque, produção, NF)
- [ ] Ambiente de produção e primeira release (`release/1.0.0`)

---

## Stack

| Camada | Tecnologia |
| --- | --- |
| Framework | Next.js 16.3 (App Router, Turbopack), React 19.2 |
| Linguagem | TypeScript 5 |
| Estilo | Tailwind CSS 4, tw-animate-css |
| Componentes | shadcn/ui 4 (style `base-nova`, sobre Base UI), lucide-react |
| ORM | Prisma 7.10 com `@prisma/adapter-mariadb` |
| Banco | MySQL 8.0 (`joseev47_erp_dev`) |
| Qualidade | ESLint 9 (`eslint-config-next`) |

> O Next.js 16 tem mudanças de API em relação a versões anteriores. Antes de escrever código, consulte a documentação instalada em `node_modules/next/dist/docs/` (veja `AGENTS.md`).

---

## Como rodar

**Requisitos:** Node.js 24 LTS (ou `^20.19` / `^22.12`), npm e acesso de rede ao servidor MySQL.

```bash
git clone https://github.com/arthur-manoel/ERP-Goia.git
cd ERP-Goia
git checkout develop
```

Crie o `.env.local` na raiz **antes** de instalar, porque o `postinstall` gera o Prisma Client e a configuração exige `DATABASE_URL`:

```bash
cp .env.example .env.local        # PowerShell: Copy-Item .env.example .env.local
```

Preencha `DATABASE_URL` com as credenciais recebidas do time (nunca as versione):

```dotenv
DATABASE_URL="mysql://USUARIO:SENHA@HOST:3306/joseev47_erp_dev"
```

Caracteres especiais no usuário ou na senha precisam de URL encoding (por exemplo, `@` vira `%40`).

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

---

## Banco de dados (DB-first)

**O MySQL é a fonte da verdade.** A estrutura é alterada direto no banco e trazida para o código com introspecção. O banco compartilhado segue DB-first; a migração de refresh tokens está preparada para uma cópia local com baseline.

```bash
npm run db:pull      # prisma db pull + prisma generate
```

Fluxo para mudar a estrutura:

1. Combine a alteração com o time (o banco de desenvolvimento é compartilhado).
2. Aplique o DDL no MySQL.
3. Rode `npm run db:pull` e revise o diff de `prisma/schema.prisma`.
4. Faça commit do schema junto com o código que depende dele.

**Proteções** (em `prisma.config.ts` e `src/lib/prisma.ts`):

- `prisma migrate *` (exceto `migrate diff`) e `prisma db push` são bloqueados para que ninguém altere o banco compartilhado a partir do schema.
- `DATABASE_URL` só é aceita se apontar para o banco `joseev47_erp_dev`.

**Uso no código.** O cliente é `server-only` e roda somente no runtime Node.js. Use-o em Server Components, Server Actions e Route Handlers:

```ts
import { prisma } from "@/lib/prisma"
import type { produtos } from "@/generated/prisma/client"

const ativos = await prisma.produtos.findMany({
  where: { status: "ATIVO" },
  include: { categorias: true, tipos_produto: true },
})
```

Os nomes de models e campos seguem os nomes das tabelas e colunas do banco (`snake_case`). O cliente gerado em `src/generated/prisma` não é versionado; ele é recriado no `npm install` e no `npm run db:pull`.

Para explorar os dados: `npm run db:studio`.

---

## Componentes de UI (shadcn)

Os componentes ficam em `src/components/ui` e são código do projeto: podem ser editados livremente. O style é `base-nova` (primitivos Base UI, ícones lucide, cor base neutral). As classes são combinadas com `cn` (`@/lib/utils`, que reexporta o pacote `cn` mantido pelo shadcn).

Instalados: todos os 62 componentes com código no registry `base-nova`. `form` não tem arquivos nesse style; para formulários, use `field`.

```bash
npx shadcn add <componente>             # adicionar
npx shadcn add <componente> --diff      # ver diferença para a versão atual do registry
npx shadcn docs <componente>            # documentação e exemplos
npx shadcn info                         # diagnóstico da configuração
```

Antes de usar alguns componentes, configure no layout raiz (item da Fase 1):

- `tooltip` e `sidebar` precisam de `TooltipProvider`.
- `sonner` lê o tema via `next-themes`, então precisa de `ThemeProvider`. O style também oferece `toast` (Base UI) como alternativa.
- O modo escuro usa a classe `.dark` no `<html>`.

---

## Estrutura de pastas

```text
.
├── prisma/
│   └── schema.prisma        # gerado por db pull; não editar a estrutura à mão
├── prisma.config.ts         # config do Prisma CLI + proteções do banco
├── public/
├── src/
│   ├── app/                 # rotas (App Router), layout e globals.css (tema)
│   ├── components/ui/       # componentes shadcn
│   ├── generated/prisma/    # Prisma Client gerado (ignorado pelo git)
│   ├── hooks/
│   └── lib/
│       ├── prisma.ts        # instância única do PrismaClient (server-only)
│       └── utils.ts         # cn()
├── components.json          # configuração do shadcn
└── .env.example             # modelo do .env.local
```

O alias `@/*` aponta para `src/*`.

---

## Scripts

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção (inclui checagem de tipos) |
| `npm start` | Servir o build |
| `npm run lint` | ESLint |
| `npm run db:pull` | Introspectar o banco e regenerar o client |
| `npm run db:generate` | Regenerar o Prisma Client |
| `npm run db:validate` | Validar `prisma/schema.prisma` |
| `npm run db:studio` | Prisma Studio |

---

## Git Flow

| Branch | Origem | Destino | Uso |
| --- | --- | --- | --- |
| `main` | — | — | Produção. Só recebe merges de `release/*` e `hotfix/*`. Cada merge ganha uma tag `vX.Y.Z`. |
| `develop` | `main` | — | Integração. Base de todo o desenvolvimento. |
| `feature/<nome>` | `develop` | `develop` | Uma funcionalidade ou ajuste. Ex.: `feature/cadastro-clientes`. |
| `release/<versão>` | `develop` | `main` e `develop` | Estabilização de uma versão. Só correções. |
| `hotfix/<versão>` | `main` | `main` e `develop` | Correção urgente em produção. |

Regras:

- Nunca faça commit direto em `main` ou `develop`; use PR.
- Merges com `--no-ff`, para preservar o histórico de cada branch.
- Antes do PR: `npm run lint` e `npm run build` sem erros.
- Atualize este README (status, roadmap e histórico) no PR da feature.

Comandos (git puro, sem depender da extensão `git flow`):

```bash
# iniciar feature
git checkout develop && git pull
git checkout -b feature/cadastro-clientes

# finalizar feature (normalmente via PR para develop)
git checkout develop && git pull
git merge --no-ff feature/cadastro-clientes
git push origin develop
git branch -d feature/cadastro-clientes

# release
git checkout -b release/1.0.0 develop
# ...ajustes finais, versão no package.json...
git checkout main && git merge --no-ff release/1.0.0 && git tag -a v1.0.0 -m "v1.0.0"
git checkout develop && git merge --no-ff release/1.0.0
git push origin main develop --tags

# hotfix
git checkout -b hotfix/1.0.1 main
# ...correção...
git checkout main && git merge --no-ff hotfix/1.0.1 && git tag -a v1.0.1 -m "v1.0.1"
git checkout develop && git merge --no-ff hotfix/1.0.1
git push origin main develop --tags
```

**Commits** seguem [Conventional Commits](https://www.conventionalcommits.org/pt-br/), em português: `feat(estoque): registrar movimentação de ajuste`, `fix(nf): corrigir total do item`, `chore(deps): atualizar prisma`, `docs: atualizar status dos módulos`.

---

## Pendências e decisões

### Contrato de autenticação

Os helpers estão em `src/lib/{password,jwt,refreshToken,authorize}.ts`.
`POST /api/auth/login` retorna `{ id, name, role, accessToken }` e grava o refresh
no cookie `refresh_token`: httpOnly, secure em produção, sameSite lax,
path `/api/auth`, validade de sete dias. `POST /api/auth/refresh` rotaciona o cookie
e retorna `{ accessToken }`; token ausente, expirado, revogado ou reutilizado
retorna 401. Reuso de token já rotacionado revoga todos os refresh tokens do usuário.
`POST /api/auth/logout` revoga o refresh e limpa o cookie. O cookie antigo
`session_id` é removido nos fluxos de autenticação.

Configure `ACCESS_TOKEN_SECRET` com um segredo aleatório por ambiente (o `.env`
local é ignorado pelo Git). Os JWTs usam HS256 e expiram em 15 minutos.
O cliente envia `Authorization: Bearer <accessToken>` nas rotas protegidas e
chama refresh para renovar o acesso; serialize as renovações, inclusive entre
abas, pois reuso concorrente também causa revogação. Logout e alteração de perfil
não invalidam JWTs já emitidos: eles permanecem válidos até expirar.

O adapter `AuthDb` continua necessário: configure `configureAuthDb(db)` no
bootstrap de cada processo com `getUserByEmail(email)` (incluindo passwordHash)
e `getUserById(id)` (perfil atual). Retorne null para usuários inativos/inexistentes.
Os IDs precisam corresponder a `usuarios.id` (inteiro); os perfis são
`ADMINISTRACAO`, `PRODUCAO`, `VENDAS` e `FINANCEIRO`. O schema atual não define
esses quatro perfis, portanto seu mapeamento permanece responsabilidade do adapter.
A persistência dos refresh tokens usa Prisma diretamente, com hash SHA-256;
`replacedBy` guarda o ID do registro sucessor. A tabela legada `refresh_tokens`
é preservada e não é utilizada por este fluxo.

```ts
const auth = await requireRole(request, ["ADMINISTRACAO", "FINANCEIRO"]);
if (auth.error) return auth.error;
// auth.user contém id e role; nenhuma consulta ao banco nesta autorização.
```

A migration `prisma/migrations/20260919000000_add_refresh_token/migration.sql`
adiciona a tabela `RefreshToken`, relacionada a `usuarios` com `userId Int`.
Sua aplicação está pendente: este ambiente não possui DATABASE_URL configurada.
O projeto veio de introspecção, sem histórico de migrations; foi gerado um baseline do schema anterior em `20260918000000_baseline`.
Para uma cópia local existente, confira a equivalência do schema antes de registrar
esse baseline com `npx prisma migrate resolve --applied 20260918000000_baseline`.
Em banco vazio, as duas migrations serão aplicadas. O baseline reflete o Prisma;
constraints não representadas pelo ORM precisam ser preservadas no dump local. Não aceite reset de um banco com dados a preservar. A configuração
permite migrations apenas para localhost/127.0.0.1/::1; mantém a proteção do
banco compartilhado. Depois de configurar a cópia local e o baseline, execute:

```bash
npx prisma migrate dev --name add_refresh_token
npx prisma generate
node --test tests/auth.test.mjs
```

| Item | Situação |
| --- | --- |
| Check constraint `chk_ordem_producao_status_quantidade` (`ordem_producao`) | O Prisma não a representa no schema. O banco continua aplicando a regra, então trate o erro de violação na aplicação. |
| Nomes em `snake_case` no Prisma Client | Decisão: manter os nomes do banco para que `db pull` seja reprodutível. Renomear com `@@map`/`@map` só se o time decidir. |
| Relações com nomes longos (`ordem_producao_movimentacao_setor` ↔ `setores`/`usuarios`) | Geradas pela introspecção porque há duas FKs para a mesma tabela. Podem ser renomeadas no schema se atrapalharem. |
| `npm audit`: vulnerabilidades em dependências transitivas do Prisma 7.10 (`mariadb`, `mysql2`, `deepmerge-ts`) | Reavaliar ao atualizar o Prisma (o 8.0 ainda está em RC). |
| `src/app/page.tsx` ainda é placeholder (import `Image` não usado) | Substituir na Fase 1. |
| `ThemeProvider`, `TooltipProvider` e `Toaster` ausentes no layout | Fase 1. |

---

## Histórico

| Data | Autor | Branch | Descrição |
| --- | --- | --- | --- |
| 2026-09-19 | — | — | JWT com refresh tokens rotativos e hash SHA-256, detecção de reuso e RBAC por Bearer; aplicação da migration local pendente de conexão e baseline. |
| 2026-09-18 | — | — | Autenticação Argon2id, sessões com cookie e RBAC; login/logout criados, aguardando adapter externo de persistência. |
| 2026-09-18 | Everton | `feature/readme-acompanhamento` | README reescrito como painel de acompanhamento do desenvolvimento. |
| 2026-09-18 | Everton | `feature/shadcn-components` | Todos os componentes shadcn (`base-nova`); alias `@/*` → `src/*`; correção da fonte Geist no tema. |
| 2026-09-18 | Everton | `feature/prisma-db-pull` | Schema introspectado do MySQL (48 tabelas); fluxo DB-first com proteções; remoção do model e da migration de demonstração. |
| 2026-09-17 | Arthur | `develop` | Prisma 7 + adapter MariaDB e setup inicial do shadcn. |
| — | Arthur | `main` | Projeto Next.js inicializado. |
