# Revisão visual de categorias

Capturas dos componentes reais de `/cadastros/categorias` em uma prévia local
isolada, com respostas fictícias no contrato da API. Não contêm credenciais nem
registros de banco e não representam teste com MySQL real.

- `listagem-clara.png`: listagem paginada no tema claro.
- `listagem-escura.png`: listagem no tema escuro.
- `formulario.png`: formulário de cadastro.
- `mobile.png`: viewport de 390 × 844 pixels, com rolagem horizontal na tabela.

Foram conferidos cadastro, edição, duplicidade, validação do nome, filtros,
paginação, estado vazio, erro/recuperação e inativação/reativação. A confirmação
de status devolve o foco do teclado ao botão Nova categoria. A troca de empresa
com uma consulta atrasada também foi conferida, sem reapresentar os dados antigos.
