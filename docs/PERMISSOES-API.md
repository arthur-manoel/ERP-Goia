# Permissões das APIs — referência à issue #13

O servidor autentica o JWT e consulta vínculos de usuário, empresa e associação
ativos a cada requisição. `ADMIN` global e nível `EMPRESA` dispensam os flags de
recurso, mas continuam exigindo vínculo ativo. Perfil funcional do JWT não concede
permissão e continua sendo uma restrição adicional nos módulos existentes.

`src/lib/permissoes.ts` centraliza os recursos, os flags e a exceção administrativa.
Ausência de concessão, recurso desconhecido ou ação inválida nega acesso.
As consultas de negócio permanecem limitadas à empresa selecionada/autorizada.

## Recursos e compatibilidade

O enum preserva a ordem dos dez valores anteriores e acrescenta `COMPRAS`,
`FORNECEDORES`, `SETORES`, `VENDAS`, `RELATORIOS`, `FLUXOS_PRODUCAO`, `TAMANHOS`
e `TIPOS_PRODUTO`. Notas usam o valor já existente `NOTAS_FISCAIS`.

As permissões são independentes: `PRODUTOS` não concede acesso a tamanhos ou tipos;
`ORDENS_PRODUCAO` não concede acesso ao cadastro de setores ou fluxos. A associação
de um fluxo ao produto continua sendo edição de `PRODUTOS`.

Compras, vendas e notas fiscais têm recursos definidos, mas não possuem Route
Handlers neste checkout. Os pedidos comerciais continuam em `PEDIDOS`; não se
confundem com o futuro módulo `VENDAS`. Novas APIs devem usar o recurso próprio.
Os recursos legados `MODELOS` e `CATEGORIAS` também são preservados.

Não há concessão nem cópia automática de permissões. Após o deploy, usuários
comuns precisam receber os novos flags por uma operação administrativa revisada.
O CRUD de concessões, permissões de setor, páginas, Server Actions, menu e botões
da issue #13 não são implementados por esta alteração.

## Matriz de rotas

Leitura usa `pode_ler`; criação usa `pode_criar`; edição/inativação por PATCH ou PUT
usa `pode_editar`; DELETE usa `pode_excluir`, salvo as regras compostas abaixo.
HEAD automático herda a autorização de GET. OPTIONS automático não lê dados.

| Rota | Métodos | Política |
| --- | --- | --- |
| `/api/auth/login` | POST | Credenciais e emissão de tokens; sem permissão de módulo |
| `/api/auth/refresh` | POST | Validação e rotação do refresh token |
| `/api/auth/logout` | POST | Revogação do refresh token |
| `/api/clientes` | GET, POST | CLIENTES: ler, criar |
| `/api/clientes/[id]` | GET, PATCH, DELETE | CLIENTES: ler, editar, excluir |
| `/api/clientes/[id]/pedidos` | GET | CLIENTES: ler; histórico do cliente |
| `/api/cores` | GET, POST | CORES: ler, criar |
| `/api/cores/[id]` | GET, PUT, PATCH, DELETE | CORES: ler, editar, excluir |
| `/api/estoque` | GET, POST | ESTOQUE: ler, criar |
| `/api/estoque/[id]` | GET | ESTOQUE: ler |
| `/api/estoque-minimo` | GET, PUT | ESTOQUE: ler, editar |
| `/api/estoque-minimo/empresas` | GET | Lista somente vínculos com ESTOQUE: ler |
| `/api/fluxos-producao` | GET, POST | FLUXOS_PRODUCAO: ler, criar |
| `/api/fluxos-producao/[id]` | GET, PATCH, DELETE | FLUXOS_PRODUCAO: ler, editar, excluir |
| `/api/fornecedores` | GET, POST | FORNECEDORES: ler, criar |
| `/api/fornecedores/[id]` | GET, PUT, PATCH, DELETE | FORNECEDORES: ler, editar, excluir |
| `/api/ordens-producao` | POST | ORDENS_PRODUCAO: criar |
| `/api/ordens-producao/[id]` | GET, PATCH | ORDENS_PRODUCAO: ler, editar |
| `/api/ordens-producao/[id]/avancar` | POST | ORDENS_PRODUCAO: editar |
| `/api/ordens-producao/[id]/encerrar` | POST | ORDENS_PRODUCAO: editar |
| `/api/ordens-producao/[id]/etapas/iniciar` | POST | ORDENS_PRODUCAO: editar |
| `/api/ordens-producao/[id]/etapas/concluir` | POST | ORDENS_PRODUCAO: editar |
| `/api/pedidos` | GET, POST | PEDIDOS: ler, criar |
| `/api/pedidos/[id]` | GET, PATCH | PEDIDOS: ler, editar |
| `/api/pedidos/[id]/itens` | POST | PEDIDOS: editar (altera um pedido existente) |
| `/api/pedidos/[id]/itens/[idItem]` | PATCH, DELETE | PEDIDOS: editar; DELETE exige editar e excluir |
| `/api/pedidos/[id]/fechar` | POST | PEDIDOS: editar; gera recebíveis sem conceder acesso financeiro |
| `/api/pedidos/[id]/conta-a-receber` | GET | FINANCEIRO: ler |
| `/api/produtos` | GET, POST | PRODUTOS: ler, criar |
| `/api/produtos/[id]` | GET, PUT, PATCH, DELETE | PRODUTOS: ler, editar, excluir |
| `/api/produtos/[id]/fluxo` | GET, PUT, DELETE | PRODUTOS: ler; PUT/DELETE exigem editar |
| `/api/relatorios/estoque/produtos` | GET | ESTOQUE: ler e RELATORIOS: ler no mesmo vínculo |
| `/api/setores` | GET, POST | SETORES: ler, criar |
| `/api/setores/[id]` | GET, PATCH, DELETE | SETORES: ler, editar, excluir |
| `/api/tamanhos` | GET, POST | TAMANHOS: ler, criar |
| `/api/tamanhos/[id]` | GET, PUT, PATCH, DELETE | TAMANHOS: ler, editar, excluir |
| `/api/tipos_produto` | GET, POST | TIPOS_PRODUTO: ler, criar |
| `/api/tipos_produto/[id]` | GET, PUT, PATCH, DELETE | TIPOS_PRODUTO: ler, editar, excluir |
| `/api/usuarios` | POST | Somente ADMIN ou nível EMPRESA; não delegável por flags |

Tipos de produto são um catálogo global legado: a permissão é verificada por
vínculo, mas os registros não têm `id_empresa`. Esta alteração não transforma o
catálogo em multiempresa. Produtos compartilhados mantêm a exigência de permissão
em todas as empresas vinculadas para edição/exclusão.

## Banco e implantação

1. Aplicar o DDL de
   `prisma/migrations/20261022000000_ampliar_recursos_permissoes/migration.sql`
   antes de publicar o código. O DDL é aditivo e não altera concessões existentes.
2. Seguir o fluxo DB-first: conferir o schema com `npm run db:pull` e regenerar o
   cliente com `npm run db:generate`. No banco compartilhado, a aplicação do DDL
   cabe ao responsável pelo banco; não executar `db push`.
3. Revisar as concessões necessárias para os novos recursos. Não copiar flags de
   produtos/produção indiscriminadamente.
4. Publicar o código e validar os retornos 401/403 e o acesso por empresa.

O DDL foi planejado para MySQL/MariaDB. A execução e validação desta tarefa devem
usar apenas o banco local. Em caso de rollback do código, manter os valores novos
no enum; removê-los pode invalidar concessões já gravadas.

## Validação

`npm test` cobre independência de recurso/ação, fornecedores, setores, fluxos,
relatórios com permissões compostas e as regressões dos módulos existentes.
`tests/unit/permissoes/inventario.test.ts` exige atualizar esta matriz quando uma
rota ou método é adicionado. O inventário complementa os testes das rotas; não
substitui a revisão da política aplicada pelo handler.

Para integração real, definir `PERMISSOES_TEST_DATABASE_URL` explicitamente para
um banco MySQL local com o schema e o DDL já aplicados e executar:

```sh
node --test tests/permissoes-banco.integration.test.mjs
```

Esse teste não aplica DDL. Cria empresas, usuário e vínculos exclusivos de teste,
valida os 18 recursos e as quatro ações no banco, testa estados inativos e as
leituras compostas de relatórios, e remove suas fixtures no final.
