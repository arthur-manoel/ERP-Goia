# Componentes compartilhados de listagem, filtros e formulário (Issue #10)

Camadas (cada uma só depende das de baixo):

| Camada | Arquivos | Responsabilidade |
|---|---|---|
| Visual | `components/listagem/*`, `components/formulario/*`, `components/dialogos/confirmar-acao.tsx` | Tabela, estados, filtros, paginação, diálogo de formulário, confirmação |
| Hooks | `hooks/use-listagem.ts`, `hooks/use-obter-json.ts` | Estado da listagem; GET autenticado reaproveitando `requisitar` |
| Lógica pura | `lib/listagem/*` | Tipos, contratos reais da API, query string, fonte local, regras de estado |
| Módulo | `features/<modulo>/fonte.ts` | Onde cada tela diz **qual endpoint** e **qual contrato** usa |

Não há cliente HTTP novo: `useObterJson` usa o `requisitar` da autenticação (Bearer, `X-Empresa-Id`, renovação de token).

## Listagem com paginação no servidor

```tsx
const api = useComprasApi()                       // ou useObterJson()
const fonte = useMemo(() => criarFonteServidor<Item, Resposta>({
  obter: (url) => api.get<unknown>(url),
  rota: "/api/compras/requisicoes",
  nomes: nomesPaginacao,                          // pagina/limite/busca (ou nomesCatalogo: page/limit)
  normalizar: (corpo) => normalizarPaginacao<Item, Resposta>(corpo, "requisicoes"),
}), [api])                                        // a fonte PRECISA ser estável
const listagem = useListagem({ fonte, limite: 20 })

<BarraFiltros listagem={listagem} placeholderBusca="Buscar..."
  campos={[{ tipo: "selecao", chave: "status", rotulo: "Status", opcaoTodos: "Todos", opcoes }]} />
<Listagem listagem={listagem} rotulo="Itens" substantivo={{singular, plural}} chaveItem={(i) => i.id}
  vazio={{ icone, titulo, descricao }} colunas={[...]} acoes={[...]} />
```

- `chave` dos filtros = nome do parâmetro da API. Valor vazio = não enviado.
- Busca tem debounce (350 ms). Qualquer mudança de busca/filtro/ordenação/fonte volta à página 1.
- `listagem.meta` traz o corpo bruto da resposta (resumos, permissões).
- `listagem.recarregar()` após criar/editar/excluir.
- Ordenação (`colunas[].campoOrdenacao` + `nomes.ordenarPor/direcao`): **só ative se o endpoint aceitar**. Nenhum endpoint atual aceita.

## Endpoint sem busca "contém" / sem paginação: `criarFonteLocal`

Contingência documentada (ver `features/fornecedores/fonte.ts`). Carrega tudo uma vez, busca e pagina no navegador. Troque por `criarFonteServidor` quando o backend suportar.

## Formulário em diálogo

```tsx
<FormularioDialogo<Entrada, Saida>
  titulo="Nova categoria" valoresIniciais={...} resolver={zodResolver(schema)}
  aoEnviar={async (dados) => { /* chamada à API; lance Error em falhas */ }}
  aoFechar={onClose} mensagemSucesso="Salva.">
  {(form) => <><CampoTexto form={form} nome="nome" rotulo="Nome *" /> ...</>}
</FormularioDialogo>
```

- Se o schema valida um payload convertido (texto → API), use `resolverComConversao` (ver `formulario-fornecedor.tsx`).
- Controles próprios (ex.: `SearchSelect`): `Controller` + `CampoFormulario`.
- Envio duplicado é bloqueado; falhas ficam no diálogo sem perder os dados.

## Confirmação

`<ConfirmarAcao aberto titulo descricao rotuloConfirmar destrutivo ocupado onConfirmar onFechar />`
