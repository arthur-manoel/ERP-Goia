# Como contribuir

Guia prático para quem vai desenvolver no ERP Goia: configurar o ambiente, pegar uma tarefa, abrir um PR e passar na revisão. Os padrões de código estão em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Sumário

- [1. Primeiro acesso](#1-primeiro-acesso)
- [2. Escolher uma tarefa](#2-escolher-uma-tarefa)
- [3. Fluxo do dia a dia](#3-fluxo-do-dia-a-dia)
- [4. Branches](#4-branches)
- [5. Mensagens de commit](#5-mensagens-de-commit)
- [6. Pull requests e revisão](#6-pull-requests-e-revisão)
- [7. Banco de dados](#7-banco-de-dados)
- [8. Problemas comuns](#8-problemas-comuns)

## 1. Primeiro acesso

Faça uma vez só:

- [ ] Instale **Node.js 24** (a versão está em `.nvmrc`; com nvm: `nvm install && nvm use`), **Git** e **VS Code**
- [ ] Configure seu nome e e-mail no Git (os mesmos da sua conta do GitHub):

  ```bash
  git config --global user.name "Seu Nome"
  git config --global user.email "seu-email@exemplo.com"
  ```

- [ ] Peça as **credenciais do banco** ao @arthur-manoel ou ao @evertonfigueiredo, em mensagem privada. Nunca cole credenciais em issue, PR, commit ou grupo.
- [ ] Clone o repositório e entre no `develop`:

  ```bash
  git clone https://github.com/arthur-manoel/ERP-Goia.git
  cd ERP-Goia
  git checkout develop
  ```

- [ ] Crie o `.env.local` a partir do modelo e preencha `DATABASE_URL`, `DEV_ID_USUARIO` e `DEV_ID_EMPRESA` (os ids vêm do seed, issue #8):

  ```bash
  cp .env.example .env.local
  ```

- [ ] Instale as dependências. Isso também gera o Prisma Client e ativa os hooks de commit:

  ```bash
  npm install
  ```

- [ ] Abra no VS Code e **instale as extensões recomendadas** quando ele sugerir (ESLint, Prettier, Tailwind, Prisma, EditorConfig). O código é formatado ao salvar.
- [ ] Rode `npm run dev` e abra [http://localhost:3000](http://localhost:3000)
- [ ] Leia o [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)

## 2. Escolher uma tarefa

- As tarefas são as [issues do GitHub](https://github.com/arthur-manoel/ERP-Goia/issues), organizadas por **milestone** (Fase 1 a 4) e **labels** (`mod: estoque`, `prio: alta`...).
- **Primeira tarefa?** Comece por uma [`good first issue`](https://github.com/arthur-manoel/ERP-Goia/issues?q=is%3Aopen+label%3A%22good+first+issue%22).
- Confira a seção **"Depende de"** da issue: se a dependência não estiver pronta, combine com quem está nela.
- **Atribua a issue a você** (Assignees → *assign yourself*) antes de começar, para ninguém fazer em dobro. Uma issue por vez.
- Dúvida sobre a tarefa? Comente **na issue**, para que a resposta fique registrada para todos.
- Issues com a label `decisão` precisam de uma definição do time antes de alguém implementar.

## 3. Fluxo do dia a dia

Exemplo com a issue **#18 (Cadastro de cargos)**:

```bash
# 1. Parta sempre do develop atualizado
git checkout develop
git pull

# 2. Crie a branch da issue
git checkout -b feature/18-cadastro-cargos

# 3. Trabalhe em commits pequenos
git add .
git commit -m "feat(cargos): listar cargos da empresa"

# 4. Traga as novidades do develop com frequência (evita conflitos grandes)
git fetch origin
git merge origin/develop

# 5. Envie a branch
git push -u origin feature/18-cadastro-cargos
```

6. Abra o PR no GitHub com **base `develop`**. Confira a base: até a issue #6 ser resolvida, o GitHub sugere `main` por padrão. Escreva `Closes #18` na descrição para a issue fechar sozinha no merge.
7. Espere o **CI ficar verde** e a revisão. Os revisores são marcados automaticamente.
8. Ajustes pedidos na revisão entram como **novos commits** na mesma branch. Depois que alguém revisou, não use `push --force`.
9. Depois do merge, limpe o ambiente local:

   ```bash
   git checkout develop
   git pull
   git branch -d feature/18-cadastro-cargos
   ```

## 4. Branches

Seguimos o **Git Flow** (resumo no README):

| Branch | Sai de | Volta para | Quando usar |
| --- | --- | --- | --- |
| `feature/<issue>-<descricao>` | `develop` | `develop` | Funcionalidade ou tarefa. Ex.: `feature/18-cadastro-cargos` |
| `bugfix/<issue>-<descricao>` | `develop` | `develop` | Bug encontrado no `develop` |
| `release/<versao>` | `develop` | `main` e `develop` | Preparação de versão (só revisores) |
| `hotfix/<versao>` | `main` | `main` e `develop` | Correção urgente em produção (só revisores) |

- Nunca faça commit direto em `main` ou `develop`.
- Nome da branch em minúsculas, sem acento, palavras separadas por hífen.

## 5. Mensagens de commit

Usamos [Conventional Commits](https://www.conventionalcommits.org/pt-br/). O hook `commit-msg` **recusa** mensagens fora do padrão.

```text
tipo(escopo): descrição curta no imperativo, em minúsculas e sem ponto final
```

| Tipo | Quando |
| --- | --- |
| `feat` | Funcionalidade nova |
| `fix` | Correção de bug |
| `refactor` | Mudança de código sem mudar comportamento |
| `style` | Só formatação |
| `docs` | Documentação |
| `test` | Testes |
| `chore` | Manutenção, dependências, configuração |
| `ci` | Pipeline de CI |
| `perf` | Desempenho |

O escopo é o módulo ou a entidade: `cargos`, `estoque`, `nf`, `producao`, `layout`...

```text
feat(cargos): permitir inativar cargo
fix(estoque): corrigir saldo anterior no kardex de transferência
docs: atualizar status do módulo de compras
```

## 6. Pull requests e revisão

**Quem abre o PR:**

- PRs pequenos são revisados mais rápido. Tente ficar abaixo de ~400 linhas; se passar disso, divida a issue.
- Preencha o template: o que foi feito, como testar, capturas de tela se mudou a interface.
- O CI roda lint, formatação, tipos, schema e build. **PR com CI vermelho não é revisado.**

**Quem revisa** (@arthur-manoel e @evertonfigueiredo; basta a aprovação de um):

- Confira as [regras obrigatórias](docs/ARQUITETURA.md#regras-obrigatórias): filtro por empresa, permissão no servidor, transações, zod.
- Rode a branch localmente quando mexer em regra de negócio.
- Comente com sugestão concreta. Use *Request changes* só para o que impede o merge.
- Faça o merge com **"Create a merge commit"** e apague a branch.
- Tente responder em até 1 dia útil.

## 7. Banco de dados

- O banco de desenvolvimento é **compartilhado** por todo o time. Não apague nem altere dados de outras pessoas.
- **Não altere a estrutura** (tabelas, colunas, índices) por conta própria. Abra uma issue com a label `decisão`. Depois de aprovada e aplicada no MySQL, rode `npm run db:pull` e inclua o `prisma/schema.prisma` atualizado no PR.
- `prisma migrate` e `prisma db push` são bloqueados de propósito (veja o README).
- Para explorar os dados: `npm run db:studio`.

## 8. Problemas comuns

| Sintoma | Solução |
| --- | --- |
| Commit recusado com `subject may not be empty` ou `type may not be empty` | A mensagem não segue o padrão da seção 5 |
| Commit recusado pelo `lint-staged` | Há erro de ESLint nos arquivos do commit. Rode `npm run lint` e corrija |
| CI falhou em **Formatação** | Rode `npm run format` e faça commit |
| CI falhou em **Tipos** | Rode `npm run typecheck` localmente e corrija os erros |
| `Defina DEV_ID_USUARIO no .env.local...` | Preencha os ids no `.env.local` (seção 1) |
| `DATABASE_URL deve apontar somente para joseev47_erp_dev` | Confira o nome do banco na URL do `.env.local` |
| Erros de import de `@/generated/prisma` | Rode `npm run db:generate` |
| Conflito no `package-lock.json` | Aceite a versão do `develop`, rode `npm install` e faça commit do lock gerado |
| Tela mostra "Tela em construção" | É o placeholder da rota: a issue dessa tela ainda está aberta |

Não resolveu? Pergunte na issue ou no seu PR, colando a mensagem de erro completa.
