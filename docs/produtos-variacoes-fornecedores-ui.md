# Produtos: variações e fornecedores — interface (#27)

Entrega de frontend em `/produtos`, partindo da `develop`. A ação **Grade** reaproveita a geração e manutenção das combinações existentes. A ação **Fornecedores** abre as condições comerciais específicas do produto e da empresa. As rotas abaixo são o contrato esperado pela interface e **ainda precisam ser implementadas pelo responsável pela API**. Nenhum Route Handler, serviço de backend, schema de banco ou migration foi alterado nesta entrega.

## Contrato comum

- Autenticação e empresa pelo provider existente: `Authorization: Bearer <JWT>` e `X-Empresa-Id`. Não enviar empresa ou usuário no corpo das escritas.
- Leituras sem cache e paginadas: `page=1&limit=100`; ordenação estável por ID. A interface percorre as páginas e só publica uma consulta completa. Os vínculos devem incluir ativos e inativos, evitando recriar registros históricos.
- Listagem: `{ "success": true, "data": { "rows": [], "count": 0, "page": 1, "limit": 100, "totalPages": 0 } }`.
- Escrita: POST 201; PATCH 200; envelope `{ "success": true, "data": <registro> }`. Erros `{ "success": false, "error": "mensagem legível" }` com 400/401/403/404/409/429/500 adequados. Conflitos não devem retornar sucesso.
- Revalidar acesso ao produto, empresa, permissões e referências em cada operação. As validações no navegador não substituem as do servidor.

## Fornecedores do produto (novas chamadas da tela)

| Método | Rota | Finalidade |
| --- | --- | --- |
| GET | `/api/produtos/{idProduto}/fornecedores` | Todos os vínculos do produto na empresa ativa, incluindo inativos |
| GET | `/api/produtos/{idProduto}/fornecedores/opcoes` | Fornecedores ativos e elegíveis para vínculo na empresa; linhas `{ "id": 30, "nome": "Têxtil Aurora" }` |
| POST | `/api/produtos/{idProduto}/fornecedores` | Vincular fornecedor, com condições opcionais |
| PATCH | `/api/produtos/{idProduto}/fornecedores/{idVinculo}` | Alterar somente condições enviadas ou situação do vínculo |

POST esperado:

```json
{
  "id_fornecedor": 30,
  "codigo_produto_fornecedor": "AUR-001",
  "preco_ultima_compra": "15.90",
  "prazo_entrega_dias": 7,
  "quantidade_minima": "2.500",
  "fornecedor_principal": true
}
```

Registro devolvido pela listagem e pelas escritas:

```json
{
  "id": 1,
  "id_empresa": 10,
  "id_produto": 20,
  "id_fornecedor": 30,
  "codigo_produto_fornecedor": "AUR-001",
  "preco_ultima_compra": "15.90",
  "prazo_entrega_dias": 7,
  "quantidade_minima": "2.500",
  "fornecedor_principal": true,
  "status": "ATIVO",
  "fornecedores": { "razao_social": "Têxtil Aurora Ltda", "nome_fantasia": "Têxtil Aurora" }
}
```

Limites do schema atual: código até 100 caracteres; preço `Decimal(15,2)` e quantidade mínima `Decimal(15,3)`, ambos strings decimais ou null no JSON; prazo inteiro entre 0 e 2147483647 ou null. O formulário aceita vírgula ou ponto decimal sem agrupamento de milhares e valores não negativos. Campo vazio é null; zero é preservado. O backend deve validar os mesmos limites. O preço é uma condição comercial informada pelo operador, sem criar compra ou movimentação de estoque.

PATCH de edição envia somente campos modificados, por exemplo `{ "codigo_produto_fornecedor": "AUR-002" }`; `{ "preco_ultima_compra": null }` limpa o valor, enquanto omissão o preserva. IDs são imutáveis. A situação é atualizada com `{ "status": "INATIVO" }` ou `{ "status": "ATIVO" }`, após confirmação.

Responsabilidades do backend:

- Respeitar a unicidade já existente `(id_empresa, id_produto, id_fornecedor)`, inclusive sob concorrência. Vínculo inativo é reativado via PATCH, preservando o ID; duplicata de POST retorna 409.
- As opções devem usar a elegibilidade de fornecedores da empresa: específicos ativos da própria empresa e globais ativos com associação empresa–fornecedor ativa. Não exigir que o operador tenha permissão de Compras para montar este seletor. O front exclui das opções os fornecedores que já têm vínculo ativo ou inativo.
- Revalidar elegibilidade ao vincular/reativar. Permitir consultar histórico quando o fornecedor não estiver mais disponível; falha na consulta de opções não pode bloquear a edição independente das condições de um vínculo ativo.
- Garantir no máximo um vínculo principal ativo por produto/empresa, alterando o anterior e o novo na mesma transação. Ao inativar o principal, limpar sua marca; reativação não deve substituir outro principal automaticamente. Revalidar produto ativo para criação, edição e reativação. A UI permite inativar um vínculo de produto já inativo.
- Validar permissão de leitura, criação, edição e inativação segundo o padrão de autorização de Produtos, sem permitir que PATCH de situação contorne exclusão. Persistir auditoria junto da escrita; IDs externos retornam 404.
- Essas operações mantêm o cadastro do fornecedor e o vínculo `empresa_fornecedor` intactos.

## Grade já existente e reaproveitada

| Método | Rota | Contrato consumido |
| --- | --- | --- |
| GET | `/api/produtos/{idProduto}/variacoes?page=1&limit=100` | Envelope paginado, linhas `{ id, id_cor, id_tamanho, status }`, incluindo inativas |
| POST | `/api/produtos/{idProduto}/variacoes` | `{ "variacoes": [{ "id_cor": 1, "id_tamanho": 2 }] }` |
| PATCH | `/api/produtos/{idProduto}/variacoes/{idVariacao}` | `{ "status": "ATIVO" }` ou `{ "status": "INATIVO" }` |

IDs de dimensão podem ser null, desde que ao menos uma dimensão esteja preenchida. Até 200 combinações novas por envio. Gerar apenas combinações inexistentes, inclusive considerando inativas, e impedir duplicações concorrentes no servidor (MySQL com colunas null exige atenção adicional à unicidade). A geração utiliza catálogos existentes `/api/cores` e `/api/tamanhos`; somente dimensões ativas são selecionáveis. Não alterar estoque nem recriar combinações históricas. Consulta de grade permanece visível quando os catálogos falham, com IDs como identificação alternativa.

## Uso e validação

1. Abra `/produtos` e acione o ícone de caminhão **Fornecedores de [produto]**. Para as variações, use o ícone **Grade de [produto]**.
2. Sem as novas APIs, a interface exibe indisponibilidade e bloqueia gravação. Não há armazenamento local ou sucesso simulado na aplicação.
3. Após a implementação do contrato, selecione um fornecedor, informe condições opcionais e salve. Edite condições existentes ou confirme inativação/reativação na tabela. A alteração de principal é refletida após nova consulta.
4. Mudança de empresa remonta o conteúdo, encerra os diálogos e descarta respostas antigas. Leituras usam AbortSignal; escritas fixam o cabeçalho da empresa e bloqueiam duplo envio.

Testes automatizados do cliente em `tests/unit/produtos/fornecedores-interface.test.ts` cobrem limites, valores ausentes/zero, decimais, PATCH parcial, contexto da resposta, paginação, falhas HTTP, contrato inválido e cancelamento. Validação de interface com navegador usa respostas simuladas para as novas APIs e não comprova persistência, autorização, auditoria ou concorrência do futuro backend. Capturas usam dados fictícios.

### Verificações executadas em 20/11/2026

- `npm ci` com o lockfile atual e geração do Prisma Client.
- `npm test`: 110 arquivos e 2.071 testes passaram, incluindo 36 testes novos.
- `npm run lint`, `npm run typecheck`, `npm run format:check` e `npm run db:validate`: passaram.
- `npm run build -- --webpack`: passou. O build padrão com Turbopack falhou localmente ao baixar as fontes Geist/Geist Mono de Google Fonts; nenhuma configuração de fonte foi alterada para contornar a rede. O build Webpack usou `NODE_OPTIONS=--use-system-ca` neste Windows.
- Navegador Chromium: criação e normalização de payload, validação de campos, bloqueio de duplo envio, PATCH parcial, preservação de edição após 409, limpeza explícita de valor, confirmação/cancelamento de inativação, reativação, edição com opções negadas (403), API ausente (404), nova tentativa e mudança de empresa. Também foram exercitados seleção da grade, conflito, combinação inativa sem duplicação, dimensão única e consulta da grade com catálogo de cores indisponível. Sem erros JavaScript observados nesses cenários.
- Capturas e inspeção visual em desktop claro/escuro e celular de 390 px, com rolagem interna do diálogo e da tabela.

Capturas: [desktop](imagens/produtos/fornecedores-desktop.png), [escuro](imagens/produtos/fornecedores-dark.png) e [celular](imagens/produtos/fornecedores-mobile.png).
