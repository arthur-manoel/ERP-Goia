# Guia de arquitetura

Como o código do ERP Goia é organizado e quais padrões seguir. Com 8 pessoas trabalhando em paralelo, seguir este guia é o que mantém o projeto consistente. Na dúvida, pergunte no PR ou na issue antes de inventar um padrão novo.

> O projeto usa **Next.js 16**, que tem APIs diferentes das versões antigas. Antes de usar uma API do Next, confira a documentação instalada em `node_modules/next/dist/docs/`.

## Sumário

- [Visão geral](#visão-geral)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Anatomia de um módulo](#anatomia-de-um-módulo)
- [Regras obrigatórias](#regras-obrigatórias)
- [Interface](#interface)
- [Nomenclatura](#nomenclatura)
- [Checklist de uma tela nova](#checklist-de-uma-tela-nova)

## Visão geral

- **Server-first.** Páginas são Server Components e leem o banco direto via Prisma. Não existe API REST interna.
- **Escrita via Server Actions.** Formulários chamam funções `"use server"`, que validam com **zod**, gravam com Prisma e revalidam a tela.
- **Client Components só quando necessário.** Use-os para interatividade (estado, eventos, hooks). Eles nunca importam Prisma.
- **O banco é a fonte da verdade** (fluxo DB-first; veja o README). Nomes de models e campos seguem o banco: `prisma.ordem_producao`, `id_empresa`.

```text
Página (Server Component) ──► queries.ts ──► Prisma ──► MySQL
        │
        └─► Formulário (Client) ──► actions.ts ("use server") ──► zod ──► Prisma
                                          └─► revalidatePath()
```

## Estrutura de pastas

```text
src/
├── app/
│   ├── (app)/               # telas autenticadas, com sidebar (layout compartilhado)
│   │   ├── cadastros/clientes/page.tsx
│   │   └── ...              # uma pasta por tela, espelhando o menu
│   ├── (auth)/login/        # telas sem sidebar
│   ├── layout.tsx           # <html>, fontes e Providers
│   └── globals.css          # tema (tokens de cor)
├── components/
│   ├── ui/                  # shadcn: evite editar; se editar, comente o motivo
│   ├── layout/              # sidebar, header, PageHeader, EmConstrucao
│   └── providers.tsx        # tema, tooltip e toasts
├── config/navegacao.ts      # itens do menu lateral
├── features/                # regras e componentes de cada entidade (veja abaixo)
├── generated/prisma/        # Prisma Client gerado (não versionado, não editar)
├── hooks/
└── lib/
    ├── prisma.ts            # cliente Prisma (server-only)
    ├── formatacao.ts        # formatarMoeda, formatarQuantidade, formatarData...
    ├── formulario.ts        # EstadoFormulario (retorno das Server Actions)
    ├── sessao.ts            # getSessao() / getEmpresaAtual()
    └── utils.ts             # cn()
```

**As rotas ficam finas.** O `page.tsx` só busca os dados e monta a tela. A lógica fica em `src/features/<entidade>/`.

## Anatomia de um módulo

Exemplo com **cargos** (tabela `cargos`: `id_empresa`, `nome`, `descricao`, `status`):

```text
src/features/cargos/
├── queries.ts        # leituras (server-only)
├── actions.ts        # escritas ("use server")
├── schemas.ts        # validação zod, compartilhada por actions e formulário
└── components/
    ├── tabela-cargos.tsx
    └── formulario-cargo.tsx
```

### `schemas.ts`

```ts
import { z } from "zod"

export const cargoSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome").max(100),
  descricao: z
    .string()
    .trim()
    .max(255)
    .transform((valor) => valor || null),
})
```

### `queries.ts`

```ts
import "server-only"
import { prisma } from "@/lib/prisma"
import { getEmpresaAtual } from "@/lib/sessao"

export async function listarCargos() {
  const { idEmpresa } = await getEmpresaAtual()

  return prisma.cargos.findMany({
    where: { id_empresa: idEmpresa },
    orderBy: { nome: "asc" },
  })
}
```

### `actions.ts`

```ts
"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import type { EstadoFormulario } from "@/lib/formulario"
import { prisma } from "@/lib/prisma"
import { getEmpresaAtual } from "@/lib/sessao"
import { cargoSchema } from "./schemas"

export async function criarCargo(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { idEmpresa } = await getEmpresaAtual()

  const resultado = cargoSchema.safeParse(Object.fromEntries(formData))
  if (!resultado.success) {
    return { ok: false, erros: z.flattenError(resultado.error).fieldErrors }
  }

  try {
    await prisma.cargos.create({
      data: { ...resultado.data, id_empresa: idEmpresa },
    })
  } catch (erro) {
    // P2002 = violação de chave única (aqui: uk_cargo_empresa_nome)
    if (
      erro instanceof Prisma.PrismaClientKnownRequestError &&
      erro.code === "P2002"
    ) {
      return {
        ok: false,
        erros: { nome: ["Já existe um cargo com esse nome"] },
      }
    }
    throw erro
  }

  revalidatePath("/admin/cargos")
  return { ok: true, mensagem: "Cargo criado." }
}
```

### `components/formulario-cargo.tsx`

```tsx
"use client"

import { useActionState, useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { estadoInicial } from "@/lib/formulario"
import { criarCargo } from "../actions"

export function FormularioCargo() {
  const [estado, acao, pendente] = useActionState(criarCargo, estadoInicial)

  useEffect(() => {
    if (estado.ok && estado.mensagem) toast.success(estado.mensagem)
  }, [estado])

  return (
    <form action={acao} className="space-y-4">
      <Field data-invalid={!!estado.erros?.nome}>
        <FieldLabel htmlFor="nome">Nome</FieldLabel>
        <Input id="nome" name="nome" aria-invalid={!!estado.erros?.nome} />
        <FieldError>{estado.erros?.nome?.[0]}</FieldError>
      </Field>
      <Button type="submit" disabled={pendente}>
        Salvar
      </Button>
    </form>
  )
}
```

### `app/(app)/admin/cargos/page.tsx`

```tsx
import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { FormularioCargo } from "@/features/cargos/components/formulario-cargo"
import { TabelaCargos } from "@/features/cargos/components/tabela-cargos"
import { listarCargos } from "@/features/cargos/queries"

export const metadata: Metadata = { title: "Cargos" }

export default async function Page() {
  const cargos = await listarCargos()

  return (
    <>
      <PageHeader titulo="Cargos" descricao="Cargos dos usuários na empresa." />
      <FormularioCargo />
      <TabelaCargos cargos={cargos} />
    </>
  )
}
```

## Regras obrigatórias

1. **Multiempresa.** Toda leitura ou escrita em tabela com `id_empresa` filtra ou grava a empresa da sessão (`getEmpresaAtual()`). Nunca aceite `id_empresa` vindo do formulário. O mesmo vale para `id_usuario`: use `getSessao()`.
   - Enquanto a autenticação ([#11](https://github.com/arthur-manoel/ERP-Goia/issues/11), [#12](https://github.com/arthur-manoel/ERP-Goia/issues/12)) não existe, `src/lib/sessao.ts` é **provisório** e lê `DEV_ID_USUARIO` e `DEV_ID_EMPRESA` do `.env.local`. Use essas funções mesmo assim: quando o login entrar, só a implementação muda.
2. **Permissão no servidor.** Toda Server Action verifica sessão e permissão antes de gravar (helper de [#13](https://github.com/arthur-manoel/ERP-Goia/issues/13)). Esconder um botão não protege nada.
3. **Transações.** Operações que mexem em mais de uma tabela (estoque, kardex, reservas, produção, entrada de NF) usam `prisma.$transaction`. Movimentação de estoque passa **sempre** pelo serviço único de estoque ([#30](https://github.com/arthur-manoel/ERP-Goia/issues/30)).
4. **Numeração automática.** Números de pedido, compra, venda e OP vêm do helper de `sequencias_automaticas` ([#15](https://github.com/arthur-manoel/ERP-Goia/issues/15)), nunca de `count() + 1`.
5. **Auditoria.** Escritas relevantes chamam o helper de auditoria ([#14](https://github.com/arthur-manoel/ERP-Goia/issues/14)).
6. **Validação com zod** em toda Server Action, mesmo que o formulário já valide.
7. **Prisma só no servidor.** `src/lib/prisma.ts` é `server-only`. Em Client Components, importe no máximo **tipos** (`import type`) e enums de `@/generated/prisma/enums`.
8. **Decimal e BigInt não atravessam para Client Components.** Campos `Decimal` (valores e quantidades) e `BigInt` precisam ser convertidos antes de ir como props: formate no servidor (`formatarMoeda`) ou converta (`valor.toString()`).
9. **Datas.** O banco guarda `Timestamp`/`DateTime`. Exiba sempre com `formatarData`/`formatarDataHora`, que usam o fuso `America/Sao_Paulo`.
10. **Renderização dinâmica.** Telas dentro de `(app)` já são dinâmicas porque o layout lê cookies. Se uma consulta ao banco precisar rodar **fora** de `(app)`, chame `await connection()` (de `next/server`) antes, para ela não rodar no build.
11. **Sem segredos no cliente.** Nunca use `NEXT_PUBLIC_` para credenciais.

## Interface

- **Toda tela** começa com `<PageHeader titulo descricao acoes />`.
- **Use os componentes de `@/components/ui`** em vez de HTML cru:

  | Situação | Componente |
  | --- | --- |
  | Listagens | `table` |
  | Formulários | `field` + `input`/`select`/`textarea`/`combobox` |
  | Criar/editar sem sair da lista | `sheet` ou `dialog` |
  | Confirmação de exclusão | `alert-dialog` (nunca `dialog`) |
  | Feedback de ação | `toast.success(...)` / `toast.error(...)` (sonner) |
  | Carregando | `skeleton` (arquivo `loading.tsx` na rota) |
  | Lista vazia | `empty` |
  | Status (ATIVO, CANCELADA...) | `badge` |

- **Cores só por tokens do tema**: `bg-background`, `text-muted-foreground`, `border-border`, `bg-primary`... Nada de `bg-blue-500` ou hex solto. Assim o tema escuro funciona sozinho.
- **Ícones** de `lucide-react`.
- **Formatação** com `@/lib/formatacao`. Não formate número ou data na mão.
- **Tela nova no menu**: adicione em `src/config/navegacao.ts`.

## Nomenclatura

| O quê | Padrão | Exemplo |
| --- | --- | --- |
| Rotas (URLs) | português, kebab-case | `/compras/pedidos`, `/cadastros/tipos-produto` |
| Arquivos | kebab-case | `formulario-cargo.tsx` |
| Componentes | PascalCase | `FormularioCargo` |
| Funções e variáveis | camelCase, verbo no infinitivo | `listarCargos`, `criarCargo`, `idEmpresa` |
| Pasta de feature | nome da entidade no plural | `src/features/cargos` |
| Campos do banco | como no banco (snake_case) | `id_empresa`, `data_cadastro` |

O domínio fica em português (é a língua do banco e do negócio). Termos do framework ficam como são (`page.tsx`, `layout.tsx`, `useActionState`).

## Checklist de uma tela nova

- [ ] Rota em `src/app/(app)/...` substituindo o `EmConstrucao`
- [ ] Lógica em `src/features/<entidade>/` (queries, actions, schemas, components)
- [ ] Filtro por empresa em todas as consultas
- [ ] Validação zod e verificação de permissão nas actions
- [ ] Estados de carregando, vazio e erro tratados
- [ ] Funciona no tema claro, no escuro e no celular
- [ ] `npm run lint`, `npm run typecheck` e `npm run build` passando
- [ ] Status do módulo atualizado no README
