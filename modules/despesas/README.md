# Despesas

Módulo organizado em schemas Zod, repository Prisma, service e handlers App Router,
seguindo Contas a Pagar. Reutiliza autenticação, autorização, tratamento de erros e
rate limiter do projeto, sem criar outro mecanismo de login.

## API e segurança

- `GET/POST /api/despesas`.
- `GET/PUT/PATCH/DELETE /api/despesas/:id`.
- JWT obrigatório, papel ADMINISTRACAO ou FINANCEIRO, vínculo ativo com empresa
  ativa e permissão FINANCEIRO por ação: ler/criar/editar/excluir. As exceções de
  ADMIN global e nível EMPRESA seguem o autorizador existente e continuam exigindo
  vínculo ativo. IDs fora do escopo autorizado retornam 404.
- `X-Empresa-Id`, se enviado, restringe a operação à empresa selecionada. Corpo ou
  filtros fora desse escopo retornam 403, inclusive para usuários multiempresa.
- Rate limit por usuário autenticado/processo: 120 leituras e 30 escritas/minuto,
  compartilhados entre coleção e ID. Tokens inválidos não ocupam contadores.
  Limite entre instâncias requer uma store compartilhada externa.

Cadastro exige `id_empresa`, `id_categoria`, `descricao`, `data_despesa`, `valor`.
`id_conta_pagar` e `observacao` são opcionais; situação padrão ABERTA. Dinheiro
aceita número JSON ou string decimal com ponto, até duas casas decimais, maior
que zero e dentro de DECIMAL(15,2). Datas civis usam AAAA-MM-DD em UTC. Descrição:
1 a 255 caracteres; observação aceita texto longo até o limite TEXT do modelo.
IDs e datas de auditoria não podem ser enviados pelo cliente. O banco preenche
cadastro e o servidor atualiza `data_atualizacao`.

```json
{
  "id_empresa": 10,
  "id_categoria": 30,
  "descricao": "Energia elétrica",
  "data_despesa": "2026-10-24",
  "valor": "150.25",
  "id_conta_pagar": 20
}
```

PUT exige todos os campos obrigatórios e restaura opcionais omitidos aos padrões.
PATCH aceita um objeto parcial não vazio. Categoria deve estar ativa, permitir
DESPESA/AMBOS e pertencer à empresa. Conta a pagar deve existir na mesma empresa e
não estar cancelada. Relação inexistente/incompatível retorna 400; conta cancelada
retorna 409. A consulta e validação da conta vinculada usam FOR UPDATE.

## Proteção financeira e histórico

Despesas pagas, canceladas ou com movimentações permitem apenas metadados
(`descricao`, `observacao`). Alterar valor, data, empresa, categoria, vínculo com
conta ou situação retorna 409. DELETE nunca apaga: cancela despesas abertas sem
movimentações e é idempotente para registros já cancelados.

**Este módulo não implementa pagamento nem estorno.** Marcar PAGA pelo cadastro
retorna 409. Despesas pagas ou movimentadas não podem ser canceladas por esta API;
um futuro fluxo de estorno deverá registrar a contrapartida financeira e ajustar
pagamentos/saldos/situação em uma transação auditada, respeitando os mesmos locks.
Não há alteração silenciosa do histórico para simular esse fluxo.

Contas a pagar vinculadas a despesas pagas também não podem ter seu plano
financeiro alterado ou ser canceladas diretamente por Contas a Pagar.

## Consulta e erros

Paginação obrigatória: `page=1`, `limit=20`, máximo 100. Filtros: `id_empresa`,
`id_categoria`, `id_conta_pagar`, `situacao`, `descricao`, `busca`, `data_despesa`
ou `data_despesa_inicio/fim`, `data_cadastro_inicio/fim`. O último dia do cadastro
é inclusivo. Ordenação: `ordenar_por=data_despesa|data_cadastro|valor`,
`ordem=asc|desc`, com ID como desempate. Filtros, ordenação, skip/take e count são
executados no banco. Linhas e total usam o mesmo snapshot.

```json
{ "success": true, "data": { "rows": [], "count": 0, "page": 1, "limit": 20, "totalPages": 0 } }
```

Erros: 400 validação/relacionamentos; 401 token inválido; 403 vínculo/permissão;
404 registro inacessível/inexistente; 409 regra financeira/concorrência;
429 limite excedido; 500 mensagem genérica com log interno. Exemplos:
`Conta a pagar inexistente para esta empresa.` e
`Despesa paga ou com movimentações exige estorno consistente antes de cancelamento.`

## Transações e auditoria

Escritas bloqueiam empresas em ordem crescente e depois a despesa antes de reler
o estado, validar e gravar na mesma transação READ COMMITTED. Contas a Pagar e
Contas a Receber usam a mesma ordem de bloqueio de empresas. Futuros fluxos de
movimentação também precisam seguir esse protocolo; nenhum lock protege contra
escritas externas que o ignorem.

`modules/financeiro/auditoria.ts` segue o padrão de snapshots antes/depois da
tabela `auditoria`, com autor obtido do JWT, INSERT/UPDATE e evento
CRIACAO/EDICAO/CANCELAMENTO/BAIXA/RECONCILIACAO nos dados serializados.
A auditoria usa o mesmo TransactionClient: falhar o log aborta a escrita.
Observações acima de 8 KiB são representadas no log por tamanho e SHA-256 para
caber no TEXT da auditoria; o texto completo permanece no registro financeiro.

Contas a Receber inicializa saldo no cadastro e o recalcula em escritas como
`valor_final - soma dos pagamentos CONFIRMADO`, conferindo empresa, valores e
movimentos ENTRADA/RECEBIMENTO correspondentes. Excesso de recebimento ou evidência
inconsistente retorna 409, sem saldo negativo. A reconciliação é auditada e não
cria pagamentos nem movimentos. Títulos de pedidos fechados preservam o plano.

O schema Prisma existente foi reutilizado; nenhuma migration ou alteração no
banco foi executada. Testes unitários usam Prisma mockado, incluindo rajadas e
sequências concorrentes controladas. Não substituem testes com MySQL real.
