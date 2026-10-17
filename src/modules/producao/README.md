# API de ordens de produção

Rotas de backend com Bearer JWT. Todas as operações verificam usuário, empresa e vínculo ativos no banco. `X-Empresa-Id` seleciona a empresa quando há múltiplos vínculos; se enviado, deve corresponder a um vínculo ativo, inclusive para administradores. Empresa não autorizada retorna 403. Sem header e com múltiplos vínculos, retorna 400.

Perfis aceitos: `ADMINISTRACAO` e `PRODUCAO`. Além do perfil do token, são exigidas permissões `ORDENS_PRODUCAO.pode_criar` para abertura ou `pode_editar` para outras operações, salvo usuário ADMIN ou vínculo com nível EMPRESA. O vínculo ativo continua obrigatório.

## Contrato

| Método e rota | Corpo JSON |
| --- | --- |
| `POST /api/ordens-producao` | `idProduto`, `quantidade`; opcionais: `tamanho`, `observacao`, `dataPrevisao`, `prioridade`, `setores` |
| `PATCH /api/ordens-producao/{id}` | `statusEsperado` e ao menos um campo editável da abertura, exceto `setores` |
| `POST /api/ordens-producao/{id}/avancar` | `statusEsperado`, `setorEsperado` (ID ou `null`), `statusDestino` |
| `POST /api/ordens-producao/{id}/encerrar` | `statusEsperado: "EM_PRODUCAO"`, `setorEsperado` (ID ou `null`) |

Abertura cria uma ordem com um produto/item. `setores` é uma lista ordenada de IDs de setores ativos da empresa. A lista vazia significa produção sem fluxo setorial. `tamanho` assume `UNICO` se omitido. `quantidade` aceita número ou string decimal positiva com até três casas e 12 dígitos inteiros. Strings são recomendadas para preservar precisão. Observação aceita até 255 caracteres; datas usam ISO 8601 com fuso horário. Campos desconhecidos são rejeitados.

Exemplo de abertura:

```json
{"idProduto": 12, "quantidade": "10.500", "setores": [3, 5], "observacao": "Lote piloto"}
```

Sucesso retorna 201 na abertura e 200 nas demais operações:

```json
{
  "ordem": { "id": 1, "status": "PLANEJADA" },
  "perdaAplicada": false,
  "baixaEstoque": "pendente",
  "disponibilidadeEstoque": "nao_verificada"
}
```

`ordem` contém os campos persistidos e as relações `ordem_producao_item` (com `ordem_producao_consumo_planejado`), `ordem_producao_fluxo_setor` e `ordem_producao_movimentacao_setor`. Decimais são serializados como strings e datas como ISO. IDs de setor e status retornados devem ser usados como estado esperado nas próximas chamadas.

Erros seguem `{ "error": "mensagem" }`: 400 para entrada inválida, 401 para autenticação, 403 para acesso negado, 404 para ordem inexistente na empresa, 409 para conflito de estado/concorrência e 500 para falha inesperada.

## Regras

- Caminho principal: `PLANEJADA → LIBERADA → EM_PRODUCAO → CONCLUIDA`.
- `PLANEJADA` e `LIBERADA` podem ir para `AGUARDANDO_MATERIAL`, que retorna a `LIBERADA`. Essa liberação é uma confirmação administrativa; a API não verifica disponibilidade nem reserva material.
- `EM_PRODUCAO → PAUSADA → EM_PRODUCAO` retoma o mesmo setor. Não há retorno a `PLANEJADA` nem cancelamento por estes endpoints.
- De `LIBERADA` a `EM_PRODUCAO`, a ordem entra no primeiro setor. De `EM_PRODUCAO` a `EM_PRODUCAO`, avança exatamente um setor. Cada avanço confirma a transferência integral, registrando entrega e recebimento pelo usuário responsável. Movimentação parcial não faz parte deste contrato.
- Encerramento confirma a produção integral planejada, exige início da produção, último setor e histórico de passagem por todos os setores, sem movimentação em trânsito. Sem fluxo configurado, exige o estado `EM_PRODUCAO`.
- Produto, quantidade, tamanho e prioridade só podem ser editados em `PLANEJADA`. Nos demais estados não terminais, somente observação e previsão são editáveis. Estados terminais bloqueiam qualquer alteração.
- Na abertura ou troca de produto/quantidade em `PLANEJADA`, utiliza-se a ficha ativa, vigente e de maior versão da empresa. O cálculo é `quantidade × consumo unitário`, sem `perda_percentual`, com arredondamento decimal HALF_UP em três casas. Edições de observação/previsão não recalculam insumos. Quantidades resultantes nulas por arredondamento ou acima da capacidade do banco são rejeitadas.
- Insumos previstos são persistidos; disponibilidade, faltas reais, reservas, consumo efetivo, kardex e baixa de estoque não são apurados. Os campos persistidos de disponibilidade/falta permanecem com defaults e não representam medição de saldo. Os indicadores da resposta explicitam essa limitação, inclusive após encerrar.
- Operações são transacionais com isolamento Serializable. Avanços/encerramento usam UPDATE condicionado ao status e setor esperados; conflitos retornam 409 sem repetição automática. A sequência é incrementada e a auditoria é gravada na mesma transação.

## Verificação

```bash
node tests/producao.test.mjs
node tests/producao.integration.test.mjs
# HTTP real: inicia o Next em porta local temporária e usa o MySQL configurado.
node tests/producao.integration.test.mjs --configured-db --http
```

A integração exige `PRODUCAO_TEST_DATABASE_URL` apontando para um MySQL local de testes com schema já preparado. Alternativamente, `--configured-db` usa a configuração local do projeto. O teste cria fixtures próprias, remove somente essas fixtures e não executa DDL nem migrations. Sem URL explícita/configurada, a integração é marcada como ignorada.

Com `--http`, os testes exercitam as quatro URLs no Next real, incluindo dois insumos por produto, recálculo por quantidade e troca de produto, erros HTTP, avanços concorrentes e encerramento com estoque pendente. O servidor temporário é encerrado ao terminar. Execute sem outra instância de `next dev` neste diretório para evitar disputa pelo lock de desenvolvimento.
