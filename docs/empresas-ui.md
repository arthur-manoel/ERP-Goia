# Tela de Empresas — preparação da integração

Branch local `feature/16-tela-empresas`, baseada em `origin/develop` (`179b0e8`). Contrato consultado: PR #155 (`7784ea6`), ainda aberto na análise de 21/11/2026. Sem incorporar código do backend, publicar branch ou abrir PR nesta etapa, conforme solicitado.

## Entrega

- Rota `/admin/empresas`, com carregamento, busca, filtros por cidade/situação, ordenação, paginação, estados vazio/erro e tentativa novamente.
- Cadastro e edição em diálogo, com identificação fiscal, contato, endereço, URL da logo e cor do tema. Reutiliza `PageHeader`, `Listagem`, `BarraFiltros`, `FormularioDialogo`, campos compartilhados, `ConfirmarAcao` e componentes do tema.
- CNPJ numérico com verificação dos dígitos, UF válida, telefone com DDD, CEP, e-mail, limites dos textos, logo HTTPS sem credenciais e cor hexadecimal. Logo não é baixada automaticamente; a cor aparece somente como prévia do cadastro.
- PATCH preparado para enviar apenas mudanças e null para limpeza de opcionais. Dados legados não alterados não bloqueiam a edição de outro campo.
- Ativação/inativação confirmada, proteção contra duplo envio, preservação dos campos após falha e descarte de consultas encerradas. O ID consultado é validado antes de abrir a edição.

O contrato `ApiEmpresas` em `src/features/empresas/api.ts` separa a tela do transporte. A rota usa `apiEmpresasPendente`, que recusa operações com mensagem explícita, sem HTTP, fixtures na aplicação ou persistência local. As implementações simuladas ficam nos testes. Portanto, este estágio não cadastra ou altera empresas no banco.

## Integração após aprovação

| Operação da tela | Endpoint previsto no PR #155 |
| --- | --- |
| Listar | GET `/api/empresas?page=1&limit=10&search=...&cidade=...&status=ATIVA&sortBy=razao_social&sortOrder=asc` |
| Abrir edição | GET `/api/empresas/{id}` |
| Criar | POST `/api/empresas` |
| Editar | PATCH `/api/empresas/{id}` |
| Inativar | DELETE `/api/empresas/{id}` |
| Reativar | PATCH `/api/empresas/{id}` com `{ "status": "ATIVA" }` |

O servidor também oferece PUT, mas a edição da tela será parcial. Cadastro usa razão social e CNPJ obrigatórios, opcionais como null e cor padrão `#22c55e`; sem IDs, usuário ou status no corpo. Decisões de autorização pertencem ao servidor: criar, mudar CNPJ/situação exigem ADMIN global; editar outros dados exige permissão de Empresas no vínculo.

A listagem do PR tem envelope `{ success: true, data: { data: [...], page, limit, total, totalPages, hasNextPage, hasPreviousPage } }`. Não confundir `data.data` com `data.rows`. `normalizarEmpresas` e `queryEmpresas` já estão testados contra esse formato.

Passos restantes da integração:

1. Atualizar a feature com a `develop` que contenha o backend aprovado. Rever alterações no contrato e compartilhar os schemas puros aprovados quando compatíveis.
2. Implementar `ApiEmpresas` com o transporte autenticado. **A gestão é global:** o provider atual exige empresa ativa e injeta `X-Empresa-Id`, que no PR #155 restringe a lista e precisa corresponder ao ID de cada registro. Preparar uma operação autenticada global no provider, preservando renovação, logout e cancelamento; não copiar tokens ou usar um fetch sem gestão da sessão. Não conectar a listagem global ao helper atual sem tratar isso.
3. Conferir com o fluxo de autenticação o acesso de ADMIN global sem vínculo/empresa ativa: o layout atual exige seleção de empresa antes de mostrar as telas. Esse caso depende da integração do contexto global e não foi alterado nesta entrega.
4. Validar sucesso e erro dos envelopes, inclusive 403, 404, 409 e 429. Após confirmação da escrita, atualizar lista e descoberta da sessão (`recarregarAcesso`), inclusive após mudança de nome ou inativação da empresa selecionada. Falha na recarga após escrita não deve induzir novo POST.
5. Exercitar permissões reais, isolamento, unicidade do CNPJ, reativação e persistência com a API aprovada. Verificar a implantação das novas colunas pelo responsável pelo banco. Nenhuma migration foi executada aqui.
6. Publicar a feature e abrir o PR integrado somente após a aprovação das duas APIs e a validação da integração.

## Validação deste estágio

Testes em `tests/unit/empresas/{interface,formulario}.test.ts`: limites/formato, CNPJ, URL segura, normalização, PATCH parcial/null, legado, query/paginação, transporte desconectado, formulário React real, erro preservando valores, duplo envio, consulta com ID incorreto, erro/vazio/retry e inativação confirmada com recarga. Serviços nos testes são simulados; nenhum teste desta etapa comprova o futuro backend.

Navegador Chromium: rota real, validação, aviso de serviço indisponível, dados preservados, ausência de chamadas à API pendente, teclado, troca de empresa e capturas claras/escuras/celular (390 px). Autenticação simulada apenas pelo teste externo; nenhuma fixture foi adicionada à aplicação. Capturas usam dados fictícios.


## Resultado da verificação local — 21/11/2026

- Suite completa: 111 arquivos, 2.068 testes passando; 33 testes novos da interface.
- ESLint, TypeScript e Prettier passaram.
- Build de produção Webpack passou com a opção de certificados do Windows (NODE_OPTIONS=--use-system-ca) e npm run build -- --webpack.
- Prisma Client gerado com URL fictícia em localhost:1, sem conectar a banco ou executar DDL. Não houve escrita em banco nesta etapa.
- Capturas inspecionadas: [claro](imagens/empresas/tela-claro.png), [escuro](imagens/empresas/tela-escuro.png) e [celular](imagens/empresas/tela-celular.png).
- Branch e commits permanecem locais; integração, testes contra APIs reais e publicação ficam para após aprovação das duas APIs.
