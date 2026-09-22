# ERP Goia

[![CI](https://github.com/arthur-manoel/ERP-Goia/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/arthur-manoel/ERP-Goia/actions/workflows/ci.yml)

ERP multiempresa com cadastros, estoque, compras, entrada de notas fiscais, produção e vendas. Aplicação única em Next.js (App Router) que acessa o MySQL direto pelo servidor via Prisma, sem backend separado.

> **Chegou agora no time?** Comece pelo [CONTRIBUTING.md](CONTRIBUTING.md) (ambiente, tarefas, PRs) e depois leia o [docs/ARQUITETURA.md](docs/ARQUITETURA.md) (padrões de código).
>
> **Este README é o painel de acompanhamento.** As tarefas estão nas [issues](https://github.com/arthur-manoel/ERP-Goia/issues). Ao concluir uma entrega, atualize o [status dos módulos](#status-dos-módulos) e o [histórico](#histórico) no mesmo PR.

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
- [Qualidade: CI, formatação e hooks](#qualidade-ci-formatação-e-hooks)
- [Git Flow](#git-flow)
- [Pendências e decisões](#pendências-e-decisões)
- [Histórico](#histórico)

---

## Status dos módulos

Legenda: ⬜ não iniciado · 🟨 em andamento · ✅ concluído · ⛔ bloqueado

| Módulo | Status | Tabelas do banco | Issues |
| --- | :---: | --- | --- |
| Infraestrutura e esqueleto | ✅ | — | PRs [#3](https://github.com/arthur-manoel/ERP-Goia/pull/3), [#4](https://github.com/arthur-manoel/ERP-Goia/pull/4), [#5](https://github.com/arthur-manoel/ERP-Goia/pull/5) |
| Base compartilhada | ⬜ | `sequencias_automaticas` | [#6](https://github.com/arthur-manoel/ERP-Goia/issues/6) a [#10](https://github.com/arthur-manoel/ERP-Goia/issues/10), [#15](https://github.com/arthur-manoel/ERP-Goia/issues/15) |
| Acesso e segurança | ⬜ | `usuarios`, `refresh_tokens`, `administradores_gerais`, `usuario_empresa`, `permissoes_usuario`, `auditoria` | [#11](https://github.com/arthur-manoel/ERP-Goia/issues/11) a [#14](https://github.com/arthur-manoel/ERP-Goia/issues/14), [#19](https://github.com/arthur-manoel/ERP-Goia/issues/19) |
| Administração | ⬜ | `empresas`, `setores`, `tipos_setor`, `permissoes_setor`, `cargos` | [#16](https://github.com/arthur-manoel/ERP-Goia/issues/16) a [#18](https://github.com/arthur-manoel/ERP-Goia/issues/18) |
| Cadastros | ⬜ | `clientes`, `fornecedores`, `empresa_fornecedor`, `categorias`, `cores`, `tamanhos`, `tipos_produto` | [#20](https://github.com/arthur-manoel/ERP-Goia/issues/20) a [#25](https://github.com/arthur-manoel/ERP-Goia/issues/25) |
| Produtos e ficha técnica | ⬜ | `produtos`, `produto_empresa`, `produto_variacoes`, `produto_fornecedor`, `ficha_tecnica`, `ficha_tecnica_item` | [#26](https://github.com/arthur-manoel/ERP-Goia/issues/26) a [#28](https://github.com/arthur-manoel/ERP-Goia/issues/28) |
| Estoque | ⬜ | `locais_estoque`, `estoque`, `movimentacao_estoque`, `kardex`, `reserva_estoque` | [#29](https://github.com/arthur-manoel/ERP-Goia/issues/29) a [#32](https://github.com/arthur-manoel/ERP-Goia/issues/32) |
| Compras | ⬜ | `requisicao_compra`, `item_requisicao_compra`, `pedido_compra`, `item_pedido_compra`, `compras`, `compra_itens` | [#33](https://github.com/arthur-manoel/ERP-Goia/issues/33) a [#35](https://github.com/arthur-manoel/ERP-Goia/issues/35) |
| Notas fiscais de entrada | ⬜ | `nota_fiscal`, `item_nota_fiscal` | [#36](https://github.com/arthur-manoel/ERP-Goia/issues/36) |
| Produção | ⬜ | `ordem_producao`, `ordem_producao_item`, `ordem_producao_consumo_planejado`, `ordem_producao_fluxo_setor`, `ordem_producao_movimentacao_setor`, `ordem_producao_movimentacao_item`, `necessidade_producao`, `consumo_producao` | [#37](https://github.com/arthur-manoel/ERP-Goia/issues/37), [#38](https://github.com/arthur-manoel/ERP-Goia/issues/38) |
| Vendas | ⬜ | `venda`, `item_venda` | [#39](https://github.com/arthur-manoel/ERP-Goia/issues/39) |
| Dashboard e relatórios | ⬜ | — | [#40](https://github.com/arthur-manoel/ERP-Goia/issues/40), [#41](https://github.com/arthur-manoel/ERP-Goia/issues/41) |

As 48 tabelas do banco `joseev47_erp_dev` estão distribuídas acima; cada uma aparece em um único módulo.

### Interface de pedidos de venda

O formulário de novo pedido e edição em `/vendas/pedidos` possui seleção de cliente, produto, tamanho e cor, preço sugerido pelo cadastro, subtotais e total automático. A disponibilidade por variação considera o saldo, outros pedidos abertos e ordens planejadas ou em produção com conclusão até a entrega. Uma insuficiência gera aviso e permite salvar para planejamento.

As variações podem ser cadastradas nos produtos prontos do estoque (unidades ou peças) e selecionadas nas ordens de produção. Produtos sem grade continuam compatíveis. O saldo geral deve corresponder à soma das variações; uma variação vinculada não pode ser removida ou renomeada.

**Status: front-end com adaptador temporário em memória.** Não cria reservas, não persiste após recarregar e não está conectado ao banco. Cadastros separados de cores/tamanhos, numeração automática e integração com as tabelas reais continuam pendentes. Nenhum dado de demonstração é carregado na aplicação.

### Interface de insumos

A tela `/estoque/insumos` reúne tecidos e aviamentos com busca, filtros por tipo e situação, indicadores clicáveis de estoque e formulário de cadastro e edição. Os destaques de reposição usam o saldo atual e o estoque mínimo informados no cadastro.

A tela `/estoque` consolida os saldos de insumos e produtos prontos em modo de consulta. Cadastros de tecidos e aviamentos são feitos somente em `/estoque/insumos`; alterações de saldo devem passar pelas movimentações de estoque.

**Status: front-end com adaptador temporário em memória.** Os cadastros não persistem após recarregar e ainda não estão conectados ao banco.

---

## Roadmap

O andamento de cada item fica na própria issue (responsável, discussão, PR). Cada milestone mostra o progresso da fase.

### Fase 0 — Infraestrutura ✅

- Next.js 16 + React 19 + TypeScript + Tailwind CSS 4
- Prisma 7 com adapter MariaDB e schema introspectado do banco (48 models, 38 enums)
- shadcn/ui com todos os componentes do style `base-nova`
- Git Flow com `main` e `develop`, CI no GitHub Actions, Prettier, ESLint, commitlint e hooks
- Esqueleto da aplicação: layout, menu, uma rota por tela, tema claro/escuro
- Guias: [CONTRIBUTING.md](CONTRIBUTING.md) e [docs/ARQUITETURA.md](docs/ARQUITETURA.md)

### Fase 1 — Base da aplicação

[Progresso da milestone](https://github.com/arthur-manoel/ERP-Goia/milestone/1)

- [#6](https://github.com/arthur-manoel/ERP-Goia/issues/6) Configurar o repositório no GitHub (admin) `prio: alta`
- [#7](https://github.com/arthur-manoel/ERP-Goia/issues/7) Credenciais individuais e segurança do banco de desenvolvimento `decisão` `prio: média`
- [#8](https://github.com/arthur-manoel/ERP-Goia/issues/8) Dados de desenvolvimento (seed) `prio: alta`
- [#9](https://github.com/arthur-manoel/ERP-Goia/issues/9) Configurar testes automatizados `prio: média`
- [#10](https://github.com/arthur-manoel/ERP-Goia/issues/10) Componentes compartilhados de listagem e formulário `prio: alta`
- [#11](https://github.com/arthur-manoel/ERP-Goia/issues/11) Autenticação: login, sessão e logout `prio: alta`
- [#12](https://github.com/arthur-manoel/ERP-Goia/issues/12) Contexto multiempresa (empresa ativa na sessão) `prio: alta`
- [#13](https://github.com/arthur-manoel/ERP-Goia/issues/13) Controle de acesso por nível e permissão `prio: alta`
- [#14](https://github.com/arthur-manoel/ERP-Goia/issues/14) Auditoria das operações `prio: média`
- [#15](https://github.com/arthur-manoel/ERP-Goia/issues/15) Numeração automática de documentos `prio: alta`

### Fase 2 — Cadastros

[Progresso da milestone](https://github.com/arthur-manoel/ERP-Goia/milestone/2)

- [#16](https://github.com/arthur-manoel/ERP-Goia/issues/16) Cadastro de empresas `prio: média`
- [#17](https://github.com/arthur-manoel/ERP-Goia/issues/17) Setores e tipos de setor `prio: alta`
- [#18](https://github.com/arthur-manoel/ERP-Goia/issues/18) Cadastro de cargos `prio: média` `good first issue`
- [#19](https://github.com/arthur-manoel/ERP-Goia/issues/19) Usuários e vínculo com empresas `prio: alta`
- [#20](https://github.com/arthur-manoel/ERP-Goia/issues/20) Cadastro de clientes `prio: alta`
- [#21](https://github.com/arthur-manoel/ERP-Goia/issues/21) Cadastro de fornecedores `prio: alta`
- [#22](https://github.com/arthur-manoel/ERP-Goia/issues/22) Cadastro de categorias `prio: média` `good first issue`
- [#23](https://github.com/arthur-manoel/ERP-Goia/issues/23) Cadastro de cores `prio: média` `good first issue`
- [#24](https://github.com/arthur-manoel/ERP-Goia/issues/24) Cadastro de tamanhos `prio: média` `good first issue`
- [#25](https://github.com/arthur-manoel/ERP-Goia/issues/25) Cadastro de tipos de produto `prio: média` `good first issue`
- [#26](https://github.com/arthur-manoel/ERP-Goia/issues/26) Produtos: cadastro base e dados por empresa `prio: alta`
- [#27](https://github.com/arthur-manoel/ERP-Goia/issues/27) Produtos: variações (cor × tamanho) e fornecedores `prio: média`
- [#28](https://github.com/arthur-manoel/ERP-Goia/issues/28) Ficha técnica `prio: alta`

### Fase 3 — Operação

[Progresso da milestone](https://github.com/arthur-manoel/ERP-Goia/milestone/3)

- [#29](https://github.com/arthur-manoel/ERP-Goia/issues/29) Cadastro de locais de estoque `prio: alta` `good first issue`
- [#30](https://github.com/arthur-manoel/ERP-Goia/issues/30) Serviço de movimentação de estoque e kardex `prio: alta`
- [#31](https://github.com/arthur-manoel/ERP-Goia/issues/31) Telas de saldos, movimentações e kardex `prio: média`
- [#32](https://github.com/arthur-manoel/ERP-Goia/issues/32) Reservas de estoque `prio: média`
- [#33](https://github.com/arthur-manoel/ERP-Goia/issues/33) Requisição de compra `prio: média`
- [#34](https://github.com/arthur-manoel/ERP-Goia/issues/34) Pedido de compra `prio: média`
- [#35](https://github.com/arthur-manoel/ERP-Goia/issues/35) Compras `decisão` `prio: média`
- [#36](https://github.com/arthur-manoel/ERP-Goia/issues/36) Entrada de nota fiscal `prio: alta`
- [#37](https://github.com/arthur-manoel/ERP-Goia/issues/37) Ordem de produção `prio: alta`
- [#38](https://github.com/arthur-manoel/ERP-Goia/issues/38) Movimentação da produção entre setores e consumo `prio: alta`
- [#39](https://github.com/arthur-manoel/ERP-Goia/issues/39) Vendas `prio: média`

### Fase 4 — Entrega

[Progresso da milestone](https://github.com/arthur-manoel/ERP-Goia/milestone/4)

- [#40](https://github.com/arthur-manoel/ERP-Goia/issues/40) Dashboard inicial `prio: baixa`
- [#41](https://github.com/arthur-manoel/ERP-Goia/issues/41) Relatórios `decisão` `prio: baixa`
- [#42](https://github.com/arthur-manoel/ERP-Goia/issues/42) Ambiente de produção e primeira release `decisão` `prio: baixa`

---

## Stack

| Camada | Tecnologia |
| --- | --- |
| Framework | Next.js 16.3 (App Router, Turbopack), React 19.2 |
| Linguagem | TypeScript 5 |
| Estilo | Tailwind CSS 4, tw-animate-css |
| Componentes | shadcn/ui 4 (style `base-nova`, sobre Base UI), lucide-react, sonner, next-themes |
| Validação | zod 4 |
| ORM | Prisma 7.10 com `@prisma/adapter-mariadb` |
| Banco | MySQL 8.0 (`joseev47_erp_dev`) |
| Qualidade | ESLint 9, Prettier 3, husky + lint-staged, commitlint, GitHub Actions |

> O Next.js 16 tem mudanças de API em relação a versões anteriores. Antes de escrever código, consulte a documentação instalada em `node_modules/next/dist/docs/` (veja `AGENTS.md`).

---

## Como rodar

O passo a passo completo, incluindo VS Code e credenciais, está no [CONTRIBUTING.md](CONTRIBUTING.md#1-primeiro-acesso). Resumo:

```bash
git clone https://github.com/arthur-manoel/ERP-Goia.git
cd ERP-Goia
git checkout develop
cp .env.example .env.local        # PowerShell: Copy-Item .env.example .env.local
```

Preencha o `.env.local` **antes** de instalar, porque o `postinstall` gera o Prisma Client e a configuração exige `DATABASE_URL`:

```dotenv
DATABASE_URL="mysql://USUARIO:SENHA@HOST:3306/joseev47_erp_dev"
DEV_ID_USUARIO=1
DEV_ID_EMPRESA=1
```

- Credenciais do banco: peça ao time em mensagem privada e nunca as versione. Caracteres especiais no usuário ou na senha precisam de URL encoding (`@` vira `%40`).
- `DEV_ID_USUARIO` e `DEV_ID_EMPRESA` alimentam a **sessão provisória** (`src/lib/sessao.ts`) até a autenticação ([#11](https://github.com/arthur-manoel/ERP-Goia/issues/11)) existir. Use ids que existam no banco (veja o seed, [#8](https://github.com/arthur-manoel/ERP-Goia/issues/8)).

```bash
npm install     # também gera o Prisma Client e ativa os hooks de commit
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Versão do Node em `.nvmrc` (24).

---

## Banco de dados (DB-first)

**O MySQL é a fonte da verdade.** A estrutura é alterada direto no banco e trazida para o código com introspecção. O projeto não usa migrations do Prisma. O banco **não tem triggers nem procedures**: toda regra de negócio fica na aplicação.

```bash
npm run db:pull      # prisma db pull + prisma generate
```

Fluxo para mudar a estrutura:

1. Abra uma issue com a label `decisão` (o banco de desenvolvimento é compartilhado).
2. Aplique o DDL no MySQL.
3. Rode `npm run db:pull` e revise o diff de `prisma/schema.prisma`.
4. Faça commit do schema junto com o código que depende dele.

**Proteções** (em `prisma.config.ts` e `src/lib/prisma.ts`):

- `prisma migrate *` (exceto `migrate diff`) e `prisma db push` são bloqueados para que ninguém altere o banco compartilhado a partir do schema.
- No MySQL remoto, `DATABASE_URL` só aceita o banco `joseev47_erp_dev`. Em localhost/127.0.0.1/::1, também aceita outros nomes para bancos locais de testes, como `compet`.

**Uso no código.** O cliente é `server-only`. Use-o em Server Components, Server Actions e Route Handlers, sempre filtrando pela empresa da sessão. O padrão completo está em [docs/ARQUITETURA.md](docs/ARQUITETURA.md#anatomia-de-um-módulo).

```ts
import { prisma } from "@/lib/prisma"
import { getEmpresaAtual } from "@/lib/sessao"

const { idEmpresa } = await getEmpresaAtual()
const ativos = await prisma.produto_empresa.findMany({
  where: { id_empresa: idEmpresa, status: "ATIVO" },
  include: { produtos: true },
})
```

Os nomes de models e campos seguem as tabelas e colunas do banco (`snake_case`). O cliente gerado em `src/generated/prisma` não é versionado; ele é recriado no `npm install` e no `npm run db:pull`. Para explorar os dados: `npm run db:studio`.

---

## Componentes de UI (shadcn)

Os componentes ficam em `src/components/ui` (style `base-nova`, com primitivos Base UI, ícones lucide e cor base neutral). As classes são combinadas com `cn` (`@/lib/utils`, que reexporta o pacote `cn` mantido pelo shadcn).

Instalados: todos os 62 componentes com código no registry `base-nova`. `form` não tem arquivos nesse style; para formulários, use `field`. Tema claro/escuro (`next-themes`), `TooltipProvider` e `Toaster` (sonner) já estão configurados em `src/components/providers.tsx`.

```bash
npx shadcn add <componente>             # adicionar
npx shadcn add <componente> --diff      # ver diferença para a versão atual do registry
npx shadcn docs <componente>            # documentação e exemplos
npx shadcn info                         # diagnóstico da configuração
```

Qual componente usar em cada situação: [docs/ARQUITETURA.md → Interface](docs/ARQUITETURA.md#interface).

---

## Estrutura de pastas

```text
.
├── .github/                 # CI, templates de PR/issue e CODEOWNERS
├── docs/ARQUITETURA.md      # padrões de código
├── prisma/schema.prisma     # gerado por db pull; não editar a estrutura à mão
├── prisma.config.ts         # config do Prisma CLI + proteções do banco
├── src/
│   ├── app/
│   │   ├── (app)/           # telas com sidebar: uma pasta por tela do menu
│   │   ├── (auth)/login/    # telas sem sidebar
│   │   └── layout.tsx       # <html>, fontes e Providers
│   ├── components/
│   │   ├── ui/              # componentes shadcn
│   │   └── layout/          # sidebar, header, PageHeader, EmConstrucao
│   ├── config/navegacao.ts  # itens do menu
│   ├── features/            # lógica por entidade (queries, actions, schemas, components)
│   ├── generated/prisma/    # Prisma Client gerado (ignorado pelo git)
│   ├── hooks/
│   └── lib/                 # prisma, sessao, formatacao, formulario, utils
├── CONTRIBUTING.md          # como contribuir
└── .env.example             # modelo do .env.local
```

O alias `@/*` aponta para `src/*`.

---

## Scripts

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm start` | Servir o build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Gera os tipos de rota do Next e roda `tsc` |
| `npm run format` | Formata o código com Prettier |
| `npm run format:check` | Verifica a formatação (usado no CI) |
| `npm run db:pull` | Introspecta o banco e regenera o client |
| `npm run db:generate` | Regenera o Prisma Client |
| `npm run db:validate` | Valida `prisma/schema.prisma` |
| `npm run db:studio` | Prisma Studio |

---

## Qualidade: CI, formatação e hooks

- **CI** (`.github/workflows/ci.yml`): em todo PR e push para `develop`/`main`, roda lint → formatação → tipos → `prisma validate` → build. PR com CI vermelho não é revisado. O CI não acessa o banco.
- **Prettier** (sem ponto e vírgula, classes Tailwind ordenadas). O VS Code formata ao salvar com as extensões recomendadas.
- **Hooks** (husky): o `pre-commit` roda ESLint e Prettier nos arquivos do commit; o `commit-msg` exige [Conventional Commits](CONTRIBUTING.md#5-mensagens-de-commit).
- **Finais de linha**: `.gitattributes` força LF, o que evita diffs fantasmas entre Windows, Linux e macOS.

---

## Git Flow

| Branch | Origem | Destino | Uso |
| --- | --- | --- | --- |
| `main` | — | — | Produção. Só recebe merges de `release/*` e `hotfix/*`. Cada merge ganha uma tag `vX.Y.Z`. |
| `develop` | `main` | — | Integração. Base de todo o desenvolvimento. |
| `feature/<issue>-<nome>` | `develop` | `develop` | Funcionalidade ou tarefa. Ex.: `feature/18-cadastro-cargos`. |
| `bugfix/<issue>-<nome>` | `develop` | `develop` | Bug encontrado no `develop`. |
| `release/<versão>` | `develop` | `main` e `develop` | Estabilização de uma versão. Só correções. |
| `hotfix/<versão>` | `main` | `main` e `develop` | Correção urgente em produção. |

- Nunca faça commit direto em `main` ou `develop`: tudo entra por PR com CI verde e aprovação de @arthur-manoel ou @evertonfigueiredo (`.github/CODEOWNERS`).
- Merge com **"Create a merge commit"** (equivalente ao `--no-ff`), para preservar o histórico de cada branch.
- O passo a passo com comandos está no [CONTRIBUTING.md](CONTRIBUTING.md#3-fluxo-do-dia-a-dia).

Release e hotfix (feitos pelos revisores):

```bash
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

---

## Pendências e decisões

### Contrato de autenticação

A autenticação está em `src/modules/auth/`: `auth.schema.ts` valida entradas com
Zod, `auth.repository.ts` concentra a persistência, `auth.service.ts` implementa
as regras e `router.ts` cuida de HTTP e cookies. As rotas apenas reexportam os
handlers. Os helpers antigos em `src/lib/{password,jwt,refreshToken,auth-cookies}.ts`
reexportam as implementações para manter compatibilidade; `authorize.ts` mantém RBAC.
As operações de refresh do repository são expostas dentro de callbacks
transacionais, mantendo o bloqueio por usuário durante as decisões do service.
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

O `src/instrumentation.ts` registra automaticamente o adapter Prisma em cada
instância Node.js do Next, antes de atender requisições, usando o singleton de
`src/lib/prisma.ts`. Não é necessário configurar o adapter nas rotas.
O adapter consulta `usuarios`, traduz `nome`/`senha` para `name`/`passwordHash`
e rejeita usuários inativos. O perfil é recalculado no login e no refresh:

- `usuarios.nivel_acesso = ADMIN` corresponde a `ADMINISTRACAO`.
- Para `USUARIO`, são considerados nomes de cargos ativos e nomes/tipos de
  setores ativos em vínculos e empresas ativos. Os nomes reconhecidos são
  `ADMINISTRACAO`/`ADMINISTRATIVO`, `PRODUCAO`, `VENDAS`/`COMERCIAL` e `FINANCEIRO`,
  ignorando acentos, espaços nas extremidades e maiúsculas/minúsculas.
- Nomes não reconhecidos não concedem perfil. Nenhum perfil reconhecido, ou mais
  de um perfil distinto, impede autenticação: o JWT atual comporta um único perfil.
  O nível `EMPRESA` de um vínculo não concede administração global automaticamente.

O `.env.example` mantém MySQL/MariaDB como configuração principal. Para testar no
Supabase, use `DATABASE_URL=postgresql://.../postgres?schema=erp_auth_test` no `.env`
ou `.env.local`; `DIRECT_URL` é opcional para a conexão direta/session pooler da CLI.
O driver é escolhido pela URL. A autenticação continua própria (tabela `usuarios`
e senhas Argon2id); contas do Supabase Auth não são usuários do ERP automaticamente.

Ao alternar de MySQL para PostgreSQL ou vice-versa, pare o Next e execute:

```bash
npm run db:generate
npm run db:validate
npm run dev
```

O Prisma gera um client para o provider selecionado. Para PostgreSQL, o config
deriva `prisma/postgresql/schema.prisma` do schema principal, adaptando tipos
nativos e nomes de constraints; esse arquivo é ignorado pelo Git. O schema e as
migrations originais de MySQL são preservados. `db:pull` continua exclusivo do MySQL.
A versão PostgreSQL serve para testes funcionais; não reproduz particularidades
de collation, inteiros unsigned ou demais comportamentos específicos de MySQL.

Para preparar um Supabase de teste vazio, execute `npm run db:setup:test`.
O comando exige `?schema=erp_auth_test`, cria as tabelas nesse namespace em uma
transação e não altera um schema que já exista. Não cria usuários nem senhas padrão.
Os IDs usados na autenticação são `usuarios.id`. O MySQL remoto continua restrito ao
banco `joseev47_erp_dev`; bancos locais de testes podem usar outros nomes.
A persistência dos refresh tokens usa Prisma diretamente, com hash SHA-256;
o hash fica na coluna `token` da tabela existente `refresh_tokens`.
`replaced_by` guarda o ID inteiro do registro sucessor e `data_revogacao`
registra a rotação, o logout ou a revogação por reutilização.

```ts
const auth = await requireRole(request, ["ADMINISTRACAO", "FINANCEIRO"]);
if (auth.error) return auth.error;
// auth.user contém id e role; nenhuma consulta ao banco nesta autorização.
```

A migration `prisma/migrations/20260920000000_refresh_token_rotation/migration.sql`
adiciona somente `replaced_by INTEGER NULL` à tabela `refresh_tokens`.
Aplique essa alteração antes de subir o código. A migration que criava a tabela
paralela foi removida. Se ela já foi aplicada em algum ambiente, reconcilie o
histórico antes do deploy; esta alteração não remove automaticamente tabelas existentes.
O projeto veio de introspecção, sem histórico de migrations; foi gerado um baseline do schema anterior em `20260918000000_baseline`.
Para uma cópia local existente, confira a equivalência do schema antes de registrar
esse baseline com `npx prisma migrate resolve --applied 20260918000000_baseline`.
Em banco vazio, as duas migrations serão aplicadas. O baseline reflete o Prisma;
constraints não representadas pelo ORM precisam ser preservadas no dump local. Não aceite reset de um banco com dados a preservar. A configuração
permite migrations apenas para localhost/127.0.0.1/::1; mantém a proteção do
banco compartilhado. Depois de configurar a cópia local e o baseline, execute:

```bash
npx prisma migrate deploy
npx prisma generate
node --test tests/auth.test.mjs
```

Teste de integração (Node >=22.15) com persistência e adapter de usuários reais:
use uma cópia **local de testes** MySQL/MariaDB com o baseline e a migration
acima aplicados. O teste cria usuários próprios e os remove ao terminar.
Por padrão, ele exige `AUTH_TEST_DATABASE_URL` e não aplica DDL automaticamente.

```bash
DATABASE_URL=mysql://USER:PASSWORD@127.0.0.1:3306/joseev47_erp_dev npm run db:generate
AUTH_TEST_DATABASE_URL=mysql://USER:PASSWORD@127.0.0.1:3306/joseev47_erp_dev node --test tests/auth.integration.test.mjs
```

Para usar o MySQL local configurado no `.env`, inclusive um banco chamado `compet`,
execute `npm run db:generate` e `node tests/auth.integration.test.mjs --configured-db`
após aplicar as migrations na cópia de testes.

Para usar o PostgreSQL de testes já configurado no `.env`, com
`?schema=erp_auth_test`, prepare a coluna de rotação nesse schema:

```sql
ALTER TABLE "erp_auth_test"."refresh_tokens"
  ADD COLUMN IF NOT EXISTS "replaced_by" INTEGER NULL;
```

Depois, gere o client para o provider configurado e execute:

```bash
npm run db:generate
node tests/auth.integration.test.mjs --configured-db
```

O teste PostgreSQL valida a persistência real do fluxo de autenticação; a migration
MySQL precisa ser validada em MySQL/MariaDB. Sem `AUTH_TEST_DATABASE_URL` ou
`--configured-db`, o teste de integração é marcado como ignorado.

| Item | Situação |
| --- | --- |
| Proteção de branches, branch padrão `develop`, merge só com merge commit | Depende de admin e de GitHub Pro para repositório privado: [#6](https://github.com/arthur-manoel/ERP-Goia/issues/6) |
| Todos usam o mesmo usuário do banco, com acesso público na porta 3306 | [#7](https://github.com/arthur-manoel/ERP-Goia/issues/7) |
| Banco de desenvolvimento vazio | Seed: [#8](https://github.com/arthur-manoel/ERP-Goia/issues/8) |
| Sessão provisória (`src/lib/sessao.ts`) lê ids do `.env.local` e é bloqueada em produção | Substituída por [#11](https://github.com/arthur-manoel/ERP-Goia/issues/11) e [#12](https://github.com/arthur-manoel/ERP-Goia/issues/12) |
| Enum de recursos de `permissoes_usuario` não cobre compras, vendas, fornecedores... | Decisão em [#13](https://github.com/arthur-manoel/ERP-Goia/issues/13) |
| `compras.id_pedido_compra_legado` sugere que `compras` substitui `pedido_compra` | Decisão em [#35](https://github.com/arthur-manoel/ERP-Goia/issues/35) |
| Check constraint `chk_ordem_producao_status_quantidade`: `quantidade_planejada > 0`, exceto nos status PLANEJADA e CANCELADA | O Prisma não a representa. Validar no zod e tratar o erro ([#37](https://github.com/arthur-manoel/ERP-Goia/issues/37)) |
| Nomes em `snake_case` no Prisma Client | Decisão: manter os nomes do banco para que `db pull` seja reprodutível |
| `npm audit`: vulnerabilidades em dependências transitivas do Prisma 7.10 (`mariadb`, `mysql2`, `deepmerge-ts`) | Reavaliar ao atualizar o Prisma (o 8.0 ainda está em RC) |

---

## Histórico

| Data | Autor | Referência | Descrição |
| --- | --- | --- | --- |
| 2026-09-18 | Everton | `feature/guia-contribuicao` | CONTRIBUTING, templates de PR e issue, CODEOWNERS; roadmap convertido em 37 issues com milestones e labels. |
| 2026-09-18 | Everton | PR [#5](https://github.com/arthur-manoel/ERP-Goia/pull/5) | Esqueleto da aplicação (layout, menu, 26 rotas), sessão provisória, helpers e guia de arquitetura. |
| 2026-09-18 | Everton | PR [#4](https://github.com/arthur-manoel/ERP-Goia/pull/4) | Prettier, husky, lint-staged, commitlint, EditorConfig, `.gitattributes` e CI. |
| 2026-09-18 | Everton | PR [#3](https://github.com/arthur-manoel/ERP-Goia/pull/3) | Prisma DB-first (48 tabelas), todos os componentes shadcn e README de acompanhamento. |
| 2026-09-17 | Arthur | `develop` | Prisma 7 + adapter MariaDB e setup inicial do shadcn. |
| 2026-09-16 | Arthur | `main` | Projeto Next.js inicializado. |
