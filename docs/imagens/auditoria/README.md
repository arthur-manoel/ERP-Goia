# Validação visual da auditoria (#14 / PR #134)

`claro.png` registra o componente real `TelaAuditoria` em uma prévia local no Chrome, com o CSS do projeto e respostas fictícias. Autenticação e requisições foram substituídas apenas na prévia ignorada em `.local/auditoria-preview`; não há alteração de autenticação na aplicação nem dados reais na imagem.

As capturas confirmam a apresentação do componente com dados fictícios. Elas não comprovam login ou conexão HTTP ao banco. A integração real com MySQL é validada separadamente por `tests/auditoria.integration.test.mjs`.

Validação concluída em **12/11/2026**, usando o código da branch do PR, em uma cópia de trabalho isolada:

| Captura | Conferência |
| --- | --- |
| [claro.png](claro.png) | Filtros, listagem e paginação no tema claro (11/11/2026). |
| [escuro.jpg](escuro.jpg) | Legibilidade dos campos, tabela, ações e paginação em tema escuro. |
| [antes-depois.jpg](antes-depois.jpg) | Comparação lado a lado de 89,90 para 99,90 em um evento fictício. |
| [celular.jpg](celular.jpg) | Viewport real de 390 × 844 px, filtros em uma coluna e tabela com rolagem horizontal interna. A largura do documento permaneceu em 390 px. |
| [celular-dialogo.jpg](celular-dialogo.jpg) | Diálogo de 343 × 408 px, comparação empilhada e fechamento acessível no celular. |

Também foram conferidos a abertura e o fechamento do diálogo, retorno do foco ao botão de origem, exibição de “Sem dados” em criação sem snapshot anterior e filtro por tabela (`cores`: uma operação fictícia). Os demais eventos reapareceram ao navegar para a tela sem filtro. O viewport temporário foi restaurado ao final.

Nenhuma alteração no componente foi necessária durante essa conferência. Fontes e dados da prévia são demonstrativos; os componentes e o CSS são os da branch `codex/auditoria-operacoes`.
