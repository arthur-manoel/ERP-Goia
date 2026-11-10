Validação do PR #131 em 10/11/2026, com a aplicação em modo de produção e MySQL local real.

O banco de desenvolvimento existente estava sem `cargos.aprova_cancelamento`. Os testes usaram um banco isolado com o schema atual do PR e registros identificados por `QA-PR131`. A conta utilizada tinha permissão somente para pedidos e estoque nas duas empresas de teste.

Os cenários HTTP passaram para opções de clientes/produtos/variações, criação e repetição com a mesma chave de idempotência, leitura persistida, edição de cabeçalho, conflito de versão, inclusão/edição/remoção de itens e recálculo dos totais. Também foram verificados quantidade zero, ausência de variação obrigatória e isolamento de lista, detalhe e opções entre empresas.

Pelo navegador, foram verificadas criação, edição de quantidade, inclusão de outra variação, persistência dos totais, busca por cliente e troca de empresa. Salvar o cabeçalho preservou a quantidade ainda em edição no item. Com o servidor temporariamente indisponível, a criação foi preservada ao fechar e reabrir o formulário. Após restabelecer o servidor, repetir a tentativa criou um único pedido.

O teste pela interface revelou a duplicação do cabeçalho de empresa no cliente autenticado. A correção usa `Headers.set`, preserva os demais cabeçalhos e mantém a recusa de requisições destinadas a outra empresa. Há testes unitários de regressão para esse caso.

Capturas da interface com dados de QA

- [Desktop claro](pr131-claro.png)
- [Desktop escuro](pr131-escuro.png)
- [Editor no celular](pr131-mobile.png)
- [Segunda empresa sem acesso aos pedidos da primeira](pr131-isolamento.png)

Os testes ocorreram no banco isolado. A compatibilidade de implantação com o banco compartilhado depende de ele possuir o schema requerido pela develop.
