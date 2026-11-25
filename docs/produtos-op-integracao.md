# Back-end para o fluxo mínimo de Produtos e Ordem de Produção

## Ficha técnica ativa

Os dois métodos abaixo estão disponíveis na develop após a integração do PR #142. A tela em /produtos/fichas-tecnicas já usa esse contrato real, valida as respostas e permite recarregar a versão ativa após conflito. O fluxo de OP já lê as tabelas `ficha_tecnica` e `ficha_tecnica_item` ao incluir o produto na ordem.

### GET /api/fichas-tecnicas/ativa?id_produto=12

Receber Bearer e X-Empresa-Id pelo cliente autenticado do ERP. Consultar o produto e a ficha dentro da empresa ativa. Para produto acessível sem ficha ativa, responder HTTP 200 com `{"success":true,"data":null}`.

Para ficha ativa, responder HTTP 200 com o seguinte formato.

```json
{
  "success": true,
  "data": {
    "id": 44,
    "versao": 1,
    "itens": [
      { "id_produto_componente": 7, "quantidade": "2.000" }
    ]
  }
}
```

### PUT /api/fichas-tecnicas/ativa

Receber o seguinte JSON.

```json
{
  "id_produto": 12,
  "id_ficha_esperada": 44,
  "itens": [
    { "id_produto_componente": 7, "quantidade": "2.000" },
    { "id_produto_componente": 9, "quantidade": "0.350" }
  ]
}
```

Usar `id_ficha_esperada: null` quando o produto ainda estiver sem ficha ativa. A resposta de sucesso segue o mesmo formato do GET, com o ID e a versão resultantes.

- Usar o padrão de autenticação e escopo de Produtos para leitura e escrita. Validar o vínculo ativo do usuário com a empresa ativa.
- Validar produto fabricável e ativo, insumos ativos e vinculados à mesma empresa, lista com pelo menos um item, componentes distintos e quantidade decimal positiva de até 12 dígitos inteiros e três casas decimais. Impedir o produto de ser componente de si mesmo.
- Em uma transação, verificar o ID ativo esperado, atribuir a próxima versão do produto na empresa e gravar os componentes. Inativar a versão anterior e ativar a nova na mesma operação. Uma composição idêntica pode retornar a ficha atual sem criar versão adicional.
- Definir a vigência para uso imediato, compatível com a seleção de ficha feita pelo serviço de OP. Usar o padrão de perda prevista zero para o fluxo mínimo. Serializar quantidades como strings.
- Usar HTTP 400 para validação, 401 e 403 para autenticação e permissões, 404 para produto fora de escopo e 409 para conflito de ficha ativa ou concorrência. Retornar erros no formato `{"success":false,"error":"mensagem"}`.
- Preservar o consumo planejado já gravado na OP. A nova versão fica disponível para inclusões e recálculos permitidos pelo fluxo existente.

## Dados necessários na empresa de teste ou implantação

- Pelo menos um tipo de produto, um insumo com controle de estoque, um produto acabado com produção e controle de estoque habilitados, e saldo do insumo disponível para reserva.
- Setores ativos, um fluxo ativo associado ao produto e um local de estoque ativo para a entrada na fábrica. A tela de OP consulta locais em `GET /api/estoque/reservas/opcoes`. O cadastro de locais é provisionado pela equipe enquanto a tela de Locais estiver em construção.
- Para produto com grade, variações ativas já cadastradas na mesma empresa. A abertura seleciona uma variação disponível e envia `id_variacao`. O primeiro aceite também pode ser feito com um produto sem grade.
- Permissões do usuário para Produtos, Setores, Fluxos, Ordens de Produção e Estoque, conforme cada operação.

O CRUD básico de Produtos, Setores e Fluxos, a associação de fluxo ao produto, a abertura da OP, a inclusão de item, a reserva, o consumo e a conclusão têm rotas existentes no develop. A ficha técnica ativa já está integrada. As rotas de variações descritas abaixo continuam pendentes para a gestão da grade pela interface.

## Grade de cores e tamanhos por produto

A interface de Produtos inclui o diálogo de grade, com seleção de cores e tamanhos, prévia do cruzamento, envio apenas das combinações ausentes e ações de inativação e reativação. As rotas abaixo precisam ser disponibilizadas pelo Back-end.

### GET /api/produtos/{id}/variacoes?page=1&limit=100

Consultar produto e grade na empresa ativa usando Bearer e X-Empresa-Id. Incluir variações ativas e inativas para evitar gerar combinações existentes.

```json
{
  "success": true,
  "data": {
    "rows": [
      { "id": 15, "id_cor": 3, "id_tamanho": 7, "status": "ATIVO" }
    ],
    "count": 1,
    "page": 1,
    "limit": 100,
    "totalPages": 1
  }
}
```

Produto acessível sem grade retorna rows vazio e HTTP 200. Usar paginação e ordenação estáveis.

### POST /api/produtos/{id}/variacoes

O corpo contém de 1 a 200 combinações. Uma dimensão pode ser null para produto que usa apenas cor ou tamanho. Pelo menos uma dimensão é obrigatória em cada combinação.

```json
{
  "variacoes": [
    { "id_cor": 3, "id_tamanho": 7 },
    { "id_cor": 3, "id_tamanho": 8 }
  ]
}
```

Retornar HTTP 201 com `{"success":true,"data":{"rows":[...]}}`, usando o formato de registro do GET.

- Validar produto ativo e disponível na empresa. Validar as dimensões ativas na mesma empresa.
- Preencher id_empresa e id_produto no servidor, a partir do contexto autorizado e do ID da rota.
- Gravar o lote inteiro em uma transação. Preservar variações já existentes e seu histórico.
- Repetição de combinação deve preservar o mesmo registro, inclusive quando uma dimensão é null. O UNIQUE do MySQL com colunas nullable requer tratamento de concorrência adicional. Usar o lock compartilhado do produto e empresa e conferir duplicidade dentro da transação.
- Uma combinação já inativa deve continuar inativa quando reenviada. A reativação é explícita pela rota de alteração de status.
- O lote idêntico já existente pode responder HTTP 200, sem duplicar registros.

### PATCH /api/produtos/{id}/variacoes/{idVariacao}

```json
{ "status": "INATIVO" }
```

Aceitar ATIVO ou INATIVO. Retornar HTTP 200 com `{"success":true,"data":{"id":15,"id_cor":3,"id_tamanho":7,"status":"INATIVO"}}`. Preservar IDs e dimensões. Validar produto/variação/empresa, vínculos e dimensões ativas na reativação. Inativação preserva os registros usados em estoque, pedidos e OPs.

As operações devem seguir a permissão PRODUTOS, registrar auditoria, respeitar o lock das operações de estoque e produção e tratar conflitos em HTTP 409. Retornar erros em `{"success":false,"error":"mensagem"}`.

## Categoria do produto

O formulário passa a consultar o catálogo existente em GET /api/categorias e enviar id_categoria no POST/PATCH de Produtos. O campo vazio envia null para remover a associação. Na edição, a categoria é omitida quando continua igual, preservando categorias históricas inativas ou indisponíveis. Essa integração usa as rotas existentes.
