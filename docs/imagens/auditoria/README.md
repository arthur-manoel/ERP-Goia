# Captura da auditoria (#14)

`claro.png` registra o componente real `TelaAuditoria` em uma prévia local no Chrome, com o CSS do projeto e respostas fictícias. Autenticação e requisições foram substituídas apenas na prévia ignorada em `.local/auditoria-preview`; não há alteração de autenticação na aplicação nem dados reais na imagem.

A captura confirma a renderização dos filtros, listagem e paginação no tema claro. Ela não comprova login, conexão HTTP ao banco nem funcionamento dos filtros. A integração real com MySQL é validada separadamente por `tests/auditoria.integration.test.mjs`.

O usuário interrompeu o controle do computador pela tecla Escape antes da inspeção do diálogo de antes/depois, tema escuro e largura de celular. Essas capturas permanecem pendentes.
