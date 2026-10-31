# Revisão visual da integração de clientes

Estas capturas mostram os componentes reais em uma prévia local com respostas
fictícias de API. Os nomes, documentos, contatos, empresas e vendas exibidos são
exemplos de teste; não são registros reais nem evidência de acesso a um banco.
O simulador usado para a prévia não faz parte da aplicação.

- `listagem-clara.png`: filtros e paginação no tema claro.
- `listagem-escura.png`: consulta no tema escuro.
- `formulario.png`: cadastro com documento opcional.
- `historico.png`: detalhes e histórico de vendas do cliente.
- `mobile.png`: tela com viewport de 390 × 844 px.

Na prévia foram exercitados busca, paginação, documento inválido, duplicidade,
cadastro, edição, consulta, histórico, inativação/reativação e troca de empresa
antes de uma resposta atrasada. Testes automatizados verificam os contratos e
as regras existentes da API com persistência simulada; não houve gravação em
banco real durante esta entrega.
