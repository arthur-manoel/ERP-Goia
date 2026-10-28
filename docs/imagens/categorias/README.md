# Revisão visual de categorias

Capturas da tela e do formulário reais, renderizados com respostas fictícias de
API em uma prévia local isolada. Os nomes, empresas e registros são dados de
demonstração; não representam um teste com banco ou credenciais reais.

- `listagem-clara.png`: consulta no tema claro.
- `listagem-escura.png`: consulta no tema escuro.
- `formulario.png`: preenchimento do formulário de cadastro.
- `mobile.png`: listagem em uma janela interna com 390 px de largura.

Na prévia foram verificados cadastro, recarga da lista e inativação. Os testes
automatizados cobrem o contrato HTTP, autorização, isolamento entre empresas,
unicidade e a participação da auditoria na transação. A validação de concorrência
com MySQL real e a aplicação das migrations seguem como etapas de implantação.
