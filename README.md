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
- `DATABASE_URL` só é aceita se apontar para o banco `joseev47_erp_dev`.

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
