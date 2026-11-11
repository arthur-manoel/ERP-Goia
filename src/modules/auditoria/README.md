# Auditoria das operações (#14)

Tela em `/admin/auditoria` e consulta em `GET /api/auditoria`. Usa a tabela existente; não exige SQL, schema ou migration.

## Acesso e consulta

JWT válido e `X-Empresa-Id` obrigatório. O vínculo, usuário e empresa devem estar ativos. Somente proprietário (`usuario_empresa.nivel_acesso = EMPRESA`) ou administrador (`usuarios.nivel_acesso = ADMIN`) consulta o histórico. A autorização é relida na transação da consulta, sem depender apenas do perfil no JWT. Eventos sem empresa não são expostos.

Filtros opcionais: `inicio` e `fim` (`YYYY-MM-DD`, dias completos em America/Fortaleza), `usuario` (ID), `tabela` (nome exato), `registro` (ID), `acao` (`INSERT`, `UPDATE`, `DELETE`, `LOGIN`, `LOGOUT`) e `pagina` (padrão 1). Parâmetros desconhecidos, repetidos, datas inválidas e intervalos invertidos retornam 400.

Retorno: `{ itens, total, pagina, totalPaginas }`. Página de 25 eventos, ordenada por data e ID decrescentes, contagem e leitura no mesmo snapshot RepeatableRead. Sem cache. A tela cancela consultas antigas e reinicia seu estado ao mudar empresa ou sessão. Valida a estrutura da resposta, as datas, a empresa de cada evento e a página antes de renderizar; respostas incompatíveis exibem erro com opção de repetição.

`antes` e `depois` são JSON interpretado. Chaves de senha, hash de senha, token, segredo, autorização e cookie são ocultadas recursivamente na resposta. Texto legado que não seja JSON é substituído por uma mensagem, evitando expor segredos não estruturados. O conteúdo original no banco permanece intacto.

## Cobertura de gravação

| Operações de negócio disponíveis | Gravação |
| --- | --- |
| Clientes e usuários | Helpers transacionais existentes em `src/modules/clientes` e `src/modules/usuarios` |
| Setores, fluxos e vínculo produto/fluxo | Helper existente em `src/modules/fluxos` |
| Pedidos, fechamento e contas a receber | Helpers existentes em `src/modules/pedidos`, `src/modules/pedido-recebiveis` e `modules/financeiro` |
| Compras, requisições, pedidos de compra e notas | Helper existente em `src/modules/compras` |
| Produção, itens, etapas, apontamentos e correções | Helpers existentes em `src/modules/producao` e `src/modules/apontamentos` |
| Estoque, mínimos, movimentos, reservas, entregas e recebimentos | Helpers existentes dos respectivos módulos |
| Cancelamentos, estornos, reembolsos e habilitação de cargos | Helpers existentes em `src/modules/cancelamentos` |
| Associações empresa/fornecedor | Helper existente em `src/modules/empresa-fornecedor` |
| Contas a pagar/receber e despesas | Helper existente em `modules/financeiro` |
| Cores, tamanhos, categorias, fornecedores, produtos e tipos de produto | **Incluída nesta entrega**, em `modules/catalogos/auditoria.ts` |

Os catálogos registram criação e alteração/inativação com snapshots completos e usuário do JWT. `AsyncLocalStorage` propaga exclusivamente o autor e as empresas da requisição autenticada, sem alterar contratos dos services. Chamadas internas sem sessão registram autor nulo (sistema).

O helper reutiliza a transação recebida ou abre uma para a escrita isolada. Nas requisições de escrita isolada, bloqueia as empresas em ordem de ID antes do cadastro, seguindo a ordem dos demais módulos e evitando inversão com a FK de auditoria. Produtos compartilhados incluem todas as empresas proprietárias nesse bloqueio. Atualizações bloqueiam o registro antes do snapshot anterior. Falha do log ou JSON acima de 65.535 bytes rejeita a mesma transação. Alterações sem efeito não geram evento. Inativação é `UPDATE`, preservando o cadastro.

Produtos compartilhados geram um evento por empresa proprietária. Transferências de cadastros preservam o evento na origem e no destino. Tipos de produto são globais: o evento é atribuído às empresas do contexto do autor, sem publicar eventos globais a outras empresas.

Consultas, relatórios e telas ainda em construção não criam eventos de alteração de negócio. Rotação de tokens e processamento interno de notificações continuam com seus próprios registros operacionais; tokens não são copiados para o histórico de negócio. Esta entrega não reconstrói operações antigas que nunca foram auditadas.

## Validação

`npm test -- tests/unit/auditoria` cobre autorização no banco, isolamento, filtros, paginação, sigilo, autoria, concorrência de contexto e propagação de falhas na transação. Os testes unitários usam Prisma simulado; o rollback físico deve ser validado em MySQL isolado antes de implantação, sem provocar falhas no banco compartilhado.
