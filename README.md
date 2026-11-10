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
| Cadastros | 🟨 | `clientes`, `fornecedores`, `empresa_fornecedor`, `categorias`, `cores`, `tamanhos`, `tipos_produto` | [#20](https://github.com/arthur-manoel/ERP-Goia/issues/20) a [#25](https://github.com/arthur-manoel/ERP-Goia/issues/25) |
| Produtos e ficha técnica | ⬜ | `produtos`, `produto_empresa`, `produto_variacoes`, `produto_fornecedor`, `ficha_tecnica`, `ficha_tecnica_item` | [#26](https://github.com/arthur-manoel/ERP-Goia/issues/26) a [#28](https://github.com/arthur-manoel/ERP-Goia/issues/28) |
| Estoque | 🟨 | `locais_estoque`, `estoque`, `estoque_minimo_local`, `movimentacao_estoque`, `kardex`, `reserva_estoque` | [#29](https://github.com/arthur-manoel/ERP-Goia/issues/29) a [#32](https://github.com/arthur-manoel/ERP-Goia/issues/32) |
| Compras | ⬜ | `requisicao_compra`, `item_requisicao_compra`, `pedido_compra`, `item_pedido_compra`, `compras`, `compra_itens` | [#33](https://github.com/arthur-manoel/ERP-Goia/issues/33) a [#35](https://github.com/arthur-manoel/ERP-Goia/issues/35) |
| Notas fiscais de entrada | ⬜ | `nota_fiscal`, `item_nota_fiscal` | [#36](https://github.com/arthur-manoel/ERP-Goia/issues/36) |
| Produção | 🟨 | `ordem_producao`, `ordem_producao_item`, `ordem_producao_consumo_planejado`, `ordem_producao_fluxo_setor`, `ordem_producao_movimentacao_setor`, `ordem_producao_movimentacao_item`, `necessidade_producao`, `consumo_producao` | [#37](https://github.com/arthur-manoel/ERP-Goia/issues/37), [#38](https://github.com/arthur-manoel/ERP-Goia/issues/38) |
| Vendas | 🟨 | `pedido_cliente`, `pedido_cliente_item`, `venda`, `item_venda` | [#39](https://github.com/arthur-manoel/ERP-Goia/issues/39); API de rascunhos e fechamento explícito após recebimento confirmado. Migration versionada; aprovação/aplicação compartilhada pendentes. |
| Financeiro do pedido | 🟨 | `pedido_cliente_fechamento`, `contas_receber`, `pagamentos_receber`, `categoria_financeira`, `condicoes_pagamento` | Geração de títulos e recebimentos explícitos, com baixa parcial/total transacional. Decisão técnica/implantação: [#91](https://github.com/arthur-manoel/ERP-Goia/issues/91). |
| Dashboard e relatórios | 🟨 | — | [#40](https://github.com/arthur-manoel/ERP-Goia/issues/40), [#41](https://github.com/arthur-manoel/ERP-Goia/issues/41) |

<details>
<summary>Referência da base develop anterior a esta entrega</summary>

O quadro acompanha os módulos e suas tabelas principais; a estrutura completa está em `prisma/schema.prisma`.

Associações empresa–fornecedor: backend e tela disponíveis em `/cadastros/empresa-fornecedor`, com condições independentes, reativação e validação de disponibilidade integrada a Compras. Contrato, arquivos e limites em [src/modules/empresa-fornecedor/README.md](src/modules/empresa-fornecedor/README.md).

Backend de ordens de produção: CRUD multiempresa, ciclo de vida, itens e apontamentos efetivos disponíveis em `/api/ordem_producao`, preservando os endpoints anteriores. Liberação de reservas e estornos de consumo/estoque permanecem pendentes; cancelamentos que dependem dessas integrações são bloqueados. Contrato e limites em [src/modules/producao/README.md](src/modules/producao/README.md).

</details>

Backend de ordens de produção: CRUD multiempresa, ciclo de vida, itens e apontamentos efetivos disponíveis em `/api/ordem_producao`, preservando os endpoints anteriores. Reservas, consumo real, entrada ao concluir e liberação no cancelamento sem efeitos irreversíveis estão integrados ao serviço de estoque. O fluxo de [cancelamentos e estornos de pedidos](src/modules/cancelamentos/README.md) preserva produção concluída, compras e consumos de material. Contrato e limites em [src/modules/producao/README.md](src/modules/producao/README.md).

### Interface de pedidos de venda, reservas, produção e recebimentos

As telas `/vendas/pedidos`, `/producao/ordens`, `/estoque/reservas`, `/financeiro` e `/financeiro/contas-receber` executam as ações operacionais nos registros reais via JWT e empresa ativa. Reservas distinguem saldo físico, reservado e disponível por variação/local, com pendências explícitas para planejamento. Consumo real e entrada na fábrica usam o serviço oficial; envio e recebimento de transferência antecedem a disponibilidade na loja. Entregas consomem as reservas e baixam uma única vez; o fechamento gera as parcelas e a tela financeira registra recebimentos parciais/totais.

Cadastro e edição estrutural de pedidos e OPs usam os contratos das APIs existentes. Regras, limites, scripts DB-first e reprodução local dos três cards na mesma entrega: [operações integradas](docs/operacoes-integradas.md). A aplicação do DDL compartilhado/produção depende do responsável antes da implantação; a publicação da PR não altera o banco.

### Interface de clientes

A tela `/cadastros/clientes` consulta `/api/clientes` com busca por nome, CPF/CNPJ completo, situação e paginação executadas no servidor. Cadastro, consulta individual, edição parcial, inativação/reativação e histórico paginado de vendas usam as rotas autenticadas existentes.

Somente nome/razão social é obrigatório. O formulário compartilha a validação da API para CPF/CNPJ (inclusive alfanumérico), UF e CEP; opcionais vazios são enviados como `null`. A edição envia apenas campos alterados, preservando documentos legados não modificados. A troca de empresa reinicia a tela e cancela consultas pendentes.

O contexto `/api/auth/contexto` fornece os vínculos ativos para seleção de empresa, sem exigir acesso a estoque. A autorização de `CLIENTES` permanece no servidor por operação. Nenhum schema, migration, permissão ou dado de demonstração foi adicionado ao fluxo real. A tela de fornecedores continua na sua implementação própria.

### Interface de categorias

A tela `/cadastros/categorias` do PR #102 está integrada à API `/api/categorias` do PR #110. Busca, filtros de situação e paginação são executados no servidor. O formulário cadastra e edita nome/descrição; a confirmação inativa por DELETE ou reativa por PATCH, preservando os vínculos históricos.

A empresa selecionada acompanha cada requisição no header `X-Empresa-Id`. A troca de empresa reinicia a tela e cancela consultas pendentes. Permissões, unicidade e regras de vínculos continuam validadas pela API existente. Nenhum schema ou migration foi alterado nesta integração.

### Interface de insumos

A tela `/estoque/insumos` reúne as posições físicas reais de produtos marcados para compra e não para venda, com busca e filtros por situação. A tela `/estoque` consolida insumos e produtos acabados. Ambas mostram depósito/localização, saldo físico, mínimo local, déficit e estados distintos para zerado, abaixo, exatamente no mínimo, regular e sem configuração.

Usuários autorizados podem configurar o mínimo por empresa, localização e produto. A quantidade reservada não participa do alerta. As posições existentes herdaram o limite anterior de `produto_empresa`; novas posições sem mínimo aparecem explicitamente como não configuradas.

**Status: saldos, mínimos locais e indicador do dashboard integrados ao Prisma.** Cadastro de produtos, movimentações e demais indicadores do dashboard continuam nas entregas próprias; este fluxo não usa o adaptador em memória.

---

## Roadmap

O andamento de cada item fica na própria issue (responsável, discussão, PR). Cada milestone mostra o progresso da fase.

### Fase 0 — Infraestrutura ✅

- Next.js 16 + React 19 + TypeScript + Tailwind CSS 4
- Prisma 7 com adapter MariaDB e schema introspectado do banco (49 models, 38 enums)
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
```

- Credenciais do banco: peça ao time em mensagem privada e nunca as versione. Caracteres especiais no usuário ou na senha precisam de URL encoding (`@` vira `%40`).
- Configure `ACCESS_TOKEN_SECRET` no ambiente do servidor para o login; veja o [contrato da API](src/modules/estoque-minimo/README.md).
- Para criar um backup lógico do MySQL com `mysqldump`, consulte [Backup diário do MySQL](docs/backup-mysql.md) (`npm run db:backup`).

```bash
npm install     # também gera o Prisma Client e ativa os hooks de commit
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Versão do Node em `.nvmrc` (24).

---

## Banco de dados (DB-first)

**O MySQL é a fonte da verdade.** A estrutura compartilhada segue aprovação DB-first e introspecção. Há migrations versionadas em `prisma/migrations`, executáveis pelo Prisma em bancos locais; seu SQL também pode ser aplicado pelo responsável em um banco compartilhado, após revisão e aprovação. O arquivo não é exclusivo do ambiente local, mas incluí-lo em uma PR não executa a alteração no banco. O banco **não tem triggers nem procedures**: toda regra de negócio fica na aplicação.

```bash
npm run db:pull      # prisma db pull + prisma generate
```

Fluxo para mudar a estrutura:

1. Abra uma issue com a label `decisão` (o banco de desenvolvimento é compartilhado).
2. Após aprovação, o responsável aplica o SQL da alteração no MySQL, preservando os dados e o histórico do ambiente.
3. Rode `npm run db:pull` e revise o diff de `prisma/schema.prisma`.
4. Faça commit do schema junto com o código que depende dele.

**Proteções** (em `prisma.config.ts` e `src/lib/prisma.ts`):

- No banco remoto, `prisma migrate *` (exceto `migrate diff`) e `prisma db push` são bloqueados para que ninguém altere o compartilhado a partir do schema. Migrations pelo Prisma são permitidas em localhost/127.0.0.1/::1; `db push` continua bloqueado.
- No MySQL remoto, `DATABASE_URL` só aceita o banco `joseev47_erp_dev`. Em localhost/127.0.0.1/::1, também aceita outros nomes para bancos locais de testes, como `compet`.

O histórico antigo não representa todas as alterações DB-first de pedidos e financeiro. Não basta executar `migrate deploy` em um banco vazio para instalar o contrato atual. Para reproduzir o fechamento em banco local isolado, veja o [preparo controlado e a migration de recebíveis](src/modules/pedido-recebiveis/README.md#testes-locais-reproduzíveis). Nunca marque migrations como aplicadas sem validar que suas alterações já existem no alvo.

**Uso no código.** O cliente é `server-only`. Use-o em Route Handlers autenticados, sempre filtrando pela empresa autorizada a partir do JWT e da seleção ativa. O padrão completo está em [docs/ARQUITETURA.md](docs/ARQUITETURA.md#anatomia-de-um-módulo).

```ts
import { prisma } from "@/lib/prisma"
// O idEmpresa vem do contexto retornado pelo autorizador do módulo
// (JWT + empresa ativa).
const idEmpresa = contexto.idEmpresa
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
│   └── lib/                 # prisma, auth, formatacao, formulario, utils
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
e retorna `{ accessToken }`. O refresh ausente, expirado, revogado ou reutilizado
recebe 401. Reutilizar um refresh rotacionado de uma sessão ainda ativa revoga
todas as sessões do usuário. A reutilização de uma sessão já encerrada recebe
401 e preserva outras sessões. Quando o navegador envia Bearer na renovação,
o cookie deve pertencer à mesma sessão.

`POST /api/auth/logout` encerra a sessão identificada pelo cookie ou por um
Bearer ainda válido. Um refresh antigo da mesma sessão também identifica a
sessão após a rotação. Um Bearer inválido recebe 401. Quando as duas credenciais
identificam sessões diferentes, a API retorna 409. A API só confirma o logout
depois de persistir a revogação.
O sucesso limpa o cookie de refresh e o antigo cookie `session_id`. Outras
sessões do usuário permanecem válidas.

Configure `ACCESS_TOKEN_SECRET` com um segredo aleatório por ambiente (o `.env`
local é ignorado pelo Git). Os JWTs usam HS256 e expiram em 15 minutos.
O cliente envia `Authorization: Bearer <accessToken>` nas rotas protegidas e
chama refresh para renovar o acesso. Serialize as renovações, inclusive entre
abas, para evitar reuso. O JWT contém um identificador aleatório de sessão
(`sid`) preservado na rotação. Em cada requisição protegida, o servidor confere
assinatura, validade, refresh ativo da mesma sessão e perfil atual. Sessões
revogadas recebem 401 de imediato. Uma sessão válida sem permissão recebe 403.
Uma falha ao consultar a sessão recebe 500 e interrompe a operação protegida.

O `src/instrumentation.ts` registra automaticamente o adapter Prisma em cada
instância Node.js do Next, antes de atender requisições, usando o singleton de
`src/lib/prisma.ts`. Não é necessário configurar o adapter nas rotas.
O adapter consulta `usuarios`, traduz `nome`/`senha` para `name`/`passwordHash`
e rejeita usuários inativos. O perfil é recalculado no login, no refresh e na
autorização.

- `usuarios.nivel_acesso = ADMIN` corresponde a `ADMINISTRACAO`.
- Para `USUARIO`, são considerados nomes de cargos ativos e nomes/tipos de
  setores ativos em vínculos e empresas ativos. Os nomes reconhecidos são
  `ADMINISTRACAO`/`ADMINISTRATIVO`, `PRODUCAO`, `VENDAS`/`COMERCIAL` e `FINANCEIRO`,
  ignorando acentos, espaços nas extremidades e maiúsculas/minúsculas.
- Nomes não reconhecidos não concedem perfil. Nenhum perfil reconhecido, ou mais
  de um perfil distinto, impede autenticação: o JWT atual comporta um único perfil.
  O nível `EMPRESA` de um vínculo não concede administração global automaticamente.

O projeto usa exclusivamente MySQL/MariaDB, com `DATABASE_URL=mysql://...`.
O Prisma utiliza `prisma/schema.prisma` e o adapter MariaDB também nas integrações
com MySQL. O banco remoto continua restrito a `joseev47_erp_dev`; bancos locais
de testes podem usar outros nomes. Após instalar as dependências, gere e valide
o client com `npm run db:generate` e `npm run db:validate`.

A persistência dos refresh tokens usa Prisma diretamente, com hash SHA-256;
o hash fica na coluna `token` da tabela existente `refresh_tokens`.
`replaced_by` guarda o ID do sucessor, `sessao_id` agrupa os refresh tokens
da sessão e `data_revogacao` registra a rotação ou revogação. A consulta usa
o índice `idx_refresh_sessao`. Emissão, rotação e revogação usam o mesmo
bloqueio por usuário, de modo que um refresh concorrente ao logout fica
revogado mesmo que já tenha emitido um JWT. A versão por usuário seria
adequada para revogar todos os dispositivos, mas o logout atual é por sessão.

A alteração de nome ou status pela API de setores compara o perfil antes e
depois, sob o mesmo bloqueio e na mesma transação que grava o setor. Quando
um perfil efetivo mudaria, a API exige administração global ou vínculo de
administrador ativo na empresa. Quem tiver o perfil alterado perde todas as
sessões e precisa entrar novamente. A API de
usuários em `develop` cadastra funcionários. Alterações diretas de nível global,
status da conta, vínculos, empresa, cargos ou setores exigem que o responsável
pelo banco identifique os usuários afetados e bloqueie suas linhas em
`usuarios` por ID crescente com `SELECT ... FOR UPDATE`. Na mesma transação
da alteração, deve atualizar os registros ativos de `refresh_tokens` desses
usuários para `revogado = 1, data_revogacao = CURRENT_TIMESTAMP` antes do
commit. Permissões de módulo e ação continuam sendo consultadas separadamente.

```ts
const auth = await requireRole(request, ["ADMINISTRACAO", "FINANCEIRO"]);
if (auth.error) return auth.error;
// auth.user contém id e role de uma sessão ativa.
```

A migration `prisma/migrations/20260920000000_refresh_token_rotation/migration.sql`
adiciona somente `replaced_by INTEGER NULL` à tabela `refresh_tokens`.
A migration [de revogação](prisma/migrations/20261110000000_revogacao_sessoes/migration.sql)
acrescenta a coluna e o índice de sessão. O responsável deve verificar o schema
anterior, aplicar os incrementos pendentes no banco e conferir a estrutura antes
de ativar o código novo. No corte, encerre o tráfego para todas as instâncias
antigas antes de liberar as novas, pois o código antigo ainda aceita JWT sem
`sid`. JWTs e refresh tokens anteriores exigem novo login. Os registros antigos
ficam com `sessao_id` nulo. A migration que criava a tabela
paralela foi removida. Se ela já foi aplicada em algum ambiente, reconcilie o
histórico antes do deploy; esta alteração não remove automaticamente tabelas existentes.
O projeto veio de introspecção, sem histórico de migrations; foi gerado um baseline do schema anterior em `20260918000000_baseline`.
Para uma cópia local existente, confira a equivalência do schema antes de registrar
esse baseline com `npx prisma migrate resolve --applied 20260918000000_baseline`.
O baseline e essa migration não cobrem todas as evoluções DB-first posteriores de pedidos/financeiro. Em banco vazio, o histórico antigo sozinho não instala o contrato atual; use a [preparação local controlada](src/modules/pedido-recebiveis/README.md#testes-locais-reproduzíveis) para o fluxo de fechamento. O baseline reflete o Prisma;
constraints não representadas pelo ORM precisam ser preservadas no dump local. Não aceite reset de um banco com dados a preservar. A configuração
permite migrations apenas para localhost/127.0.0.1/::1; mantém a proteção do
banco compartilhado. Somente depois de validar a estrutura prévia e reconciliar o histórico da cópia local, execute:

```bash
npx prisma migrate deploy
npx prisma generate
  node --test tests/auth.test.mjs
  npm test -- tests/unit/autenticacao tests/unit/estoque/authorization.test.ts
```

Teste de integração (Node >=22.15) com persistência e adapter de usuários reais:
use uma cópia **local de testes** MySQL/MariaDB com a estrutura anterior e os
incrementos de rotação e revogação aplicados. O teste cria usuários próprios e
os remove ao terminar.
Por padrão, ele exige `AUTH_TEST_DATABASE_URL` e não aplica DDL automaticamente.

```bash
DATABASE_URL=mysql://USER:PASSWORD@127.0.0.1:3306/joseev47_erp_dev npm run db:generate
AUTH_TEST_DATABASE_URL=mysql://USER:PASSWORD@127.0.0.1:3306/joseev47_erp_dev node --test tests/auth.integration.test.mjs
```

Para usar o MySQL local configurado no `.env`, inclusive um banco chamado `compet`,
execute `npm run db:generate` e `node tests/auth.integration.test.mjs --configured-db`
após aplicar as migrations na cópia de testes.

Sem `AUTH_TEST_DATABASE_URL` ou `--configured-db`, o teste de integração
é marcado como ignorado. Os testes de integração aceitam somente MySQL local.

| Item | Situação |
| --- | --- |
| Proteção de branches, branch padrão `develop`, merge só com merge commit | Depende de admin e de GitHub Pro para repositório privado: [#6](https://github.com/arthur-manoel/ERP-Goia/issues/6) |
| Todos usam o mesmo usuário do banco, com acesso público na porta 3306 | [#7](https://github.com/arthur-manoel/ERP-Goia/issues/7) |
| Banco de desenvolvimento vazio | Seed: [#8](https://github.com/arthur-manoel/ERP-Goia/issues/8) |
| Recursos e autorização por módulo | Enum com 18 valores e integração documentada na [matriz de permissões](docs/permissoes-modulos.md); novos acessos exigem atribuição explícita, sem concessão automática (#13). Conferir aplicação do SQL em cada ambiente. |
| `compras.id_pedido_compra_legado` sugere que `compras` substitui `pedido_compra` | Decisão em [#35](https://github.com/arthur-manoel/ERP-Goia/issues/35) |
| Check constraint `chk_ordem_producao_status_quantidade`: `quantidade_planejada > 0`, exceto nos status PLANEJADA e CANCELADA | O Prisma não a representa. Validar no zod e tratar o erro ([#37](https://github.com/arthur-manoel/ERP-Goia/issues/37)) |
| Nomes em `snake_case` no Prisma Client | Decisão: manter os nomes do banco para que `db pull` seja reprodutível |
| `npm audit`: vulnerabilidades em dependências transitivas do Prisma 7.10 (`mariadb`, `mysql2`, `deepmerge-ts`) | Reavaliar ao atualizar o Prisma (o 8.0 ainda está em RC) |

---

## API de relatório de quantidade por estoque

`GET /api/relatorios/estoque/produtos`: consulta de saldos atuais por local e produto,
com JWT, autorização de leitura de estoque por empresa, filtros, paginação e totais
decimais separados por unidade. Entrega somente de back-end, sem telas ou migration.
Contrato e testes locais: [documentação da API](src/modules/relatorio-estoque/README.md).

## API de estoque e relacionamento de produtos

`GET /api/estoque`, `GET /api/estoque/{id}` e `POST /api/estoque` consultam posições
reais e vinculam produtos já habilitados a locais/setores da empresa autorizada.
Novos vínculos começam com saldo zero, são auditados e idempotentes, preservando
as duas unicidades do banco. Entrega de back-end, sem telas ou alteração de schema.
Contrato e testes locais: [documentação da API](src/modules/estoque/README.md).

## API de pedidos e itens por variação

API de back-end persistida em `pedido_cliente`/`pedido_cliente_item`: consultas,
criação idempotente e edição de rascunhos, com variações, totais decimais calculados
no servidor, autorização comercial e auditoria. Sem alterações de interface ou
geração financeira. Implantação depende de aprovação/aplicação do SQL mínimo
pelo responsável do banco. [Contrato e testes locais](src/modules/pedidos/README.md).

## Fechamento de pedido e contas a receber

`POST /api/pedidos/{id}/fechar` fecha comercialmente um pedido após o recebimento
completo confirmado pelo cliente, preservando o status operacional. Uma única
transação registra a data própria do fechamento, venda, parcelas abertas e
auditoria. Valores vêm do pedido calculado no servidor; vencimentos são explícitos,
com divisão exata em centavos e resíduo na última parcela. Repetição íntegra não
duplica cobranças e mutações comuns ficam bloqueadas após o fechamento.

`GET /api/pedidos/{id}/conta-a-receber` exige leitura de FINANCEIRO separada da
permissão comercial de fechamento. Não há alteração de front-end, baixa, estoque
ou geração retroativa. A alteração está versionada em
`prisma/migrations/20261017000000_pedido_contas_receber/migration.sql`.
A aprovação/aplicação no banco compartilhado segue pendente na
[decisão #91](https://github.com/arthur-manoel/ERP-Goia/issues/91); a PR não a executa automaticamente.
[Contrato, implantação e testes locais](src/modules/pedido-recebiveis/README.md).

## Permissões por módulo e apontamentos de perdas

O backend exige os recursos próprios dos módulos, incluindo COMPRAS,
FORNECEDORES, SETORES, VENDAS, RELATORIOS, FLUXOS_PRODUCAO, TAMANHOS e
TIPOS_PRODUTO. Relatório de estoque exige leitura de RELATORIOS e ESTOQUE na
mesma empresa. A [matriz completa](docs/permissoes-modulos.md) relaciona todas
as entradas atuais, ações, exceções e cobertura.

A [API de apontamentos](src/modules/apontamentos/README.md) persiste produção,
perda, motivo e ocorrência por item/etapa, com idempotência, auditoria transacional,
correção/estorno rastreável e limites entre etapas. Preserva a tabela existente
ordem_producao_apontamento e acrescenta eventos na migration
`20261031000000_eventos_apontamentos_producao`. A revisão acrescenta confirmações
em `20261102000000_confirmacoes_producao`: a soma válida da última etapa alimenta
a quantidade produzida do item; confirmar esse total não cria outra produção.
Correções/estornos mantêm a projeção e o histórico coerentes. Não movimenta
estoque nem inclui implementação de frontend.

SQL e integração são validados em MySQL/MariaDB local e isolado; aplicação no
banco compartilhado/produção cabe ao responsável após conferência/aprovação.
Enviar ou incorporar a PR não executa DDL automaticamente.

## Histórico

- 01/11/2026: reservas, movimentações na entrega/conclusão e recebimentos integrados em uma entrega. Contrato e implantação DB-first em `docs/operacoes-integradas.md`.

| Data | Autor | Referência | Descrição |
| --- | --- | --- | --- |
| 2026-10-31 | — | `feature/21-vincular-fornecedores-empresas` | Backend e interface de associações empresa–fornecedor, condições comerciais independentes e elegibilidade de globais integrada a Compras. Sem alteração de schema ou histórico financeiro. |
| 2026-10-31 | Alexsander Gabriel | `feature/integracao-api-categorias` | Integração da tela de categorias do PR #102 à API do PR #110, com busca, paginação, cadastro, edição e situação por empresa. Sem alterações no schema ou migrations. |
| 2026-10-30 | — | Backend de ordens de produção | CRUD, ciclo de vida, itens e apontamentos em `/api/ordem_producao`, com isolamento multiempresa, permissões, rate limiting, auditoria e concorrência. Schema preservado; estornos e liberação de reservas indisponíveis bloqueiam cancelamentos dependentes. |
| 2026-10-31 | Maria | `feature/permissoes-modulos-perdas-producao` | Dois cards (#13/#38): recursos próprios na autorização, relatório com permissões combinadas, apontamentos persistidos com idempotência, histórico de correção/estorno e extensão SQL validada localmente. Sem frontend ou aplicação no banco remoto. |
| 2026-10-17 | Maria | `feature/pedido-contas-receber-automaticas` | Fechamento após recebimento confirmado e geração atômica de venda/parcelas, consulta financeira protegida e migration versionada com implantação compartilhada sujeita à aprovação da equipe (#91). Sem front-end ou baixa. |
| 2026-10-10 | Maria | `feature/api-pedidos-itens-variacoes` | API de pedidos/itens por variação, cálculos no servidor e controle transacional de rascunhos. SQL DB-first para aprovação da equipe. |
| 2026-10-01 | Maria | `feature/api-estoque-relacionamento-produtos` | API autenticada de posições e vínculo produto/local/setor com saldo zero, auditoria e proteção contra duplicidade. |
| 2026-09-18 | Everton | `feature/guia-contribuicao` | CONTRIBUTING, templates de PR e issue, CODEOWNERS; roadmap convertido em 37 issues com milestones e labels. |
| 2026-09-18 | Everton | PR [#5](https://github.com/arthur-manoel/ERP-Goia/pull/5) | Esqueleto da aplicação (layout, menu, 26 rotas), sessão provisória, helpers e guia de arquitetura. |
| 2026-09-18 | Everton | PR [#4](https://github.com/arthur-manoel/ERP-Goia/pull/4) | Prettier, husky, lint-staged, commitlint, EditorConfig, `.gitattributes` e CI. |
| 2026-09-18 | Everton | PR [#3](https://github.com/arthur-manoel/ERP-Goia/pull/3) | Prisma DB-first (48 tabelas), todos os componentes shadcn e README de acompanhamento. |
| 2026-09-17 | Arthur | `develop` | Prisma 7 + adapter MariaDB e setup inicial do shadcn. |
| 2026-09-16 | Arthur | `main` | Projeto Next.js inicializado. |
