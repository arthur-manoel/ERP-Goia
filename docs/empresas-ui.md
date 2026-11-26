# Empresas: interface integrada à API

A tela em `/admin/empresas` usa a API do PR #155, incorporado à develop em `8529a60`. A feature `feature/16-tela-empresas` foi atualizada com essa base. A entrega abrange somente Empresas; a feature de Cargos continua separada.

## Fluxo e contrato

- Listagem paginada, busca, filtros por cidade/situação e ordenação remotos; carregamento, lista vazia, erro e tentativa novamente.
- Cadastro e edição com identificação fiscal, contato, endereço, logo por URL HTTPS e cor de tema. Reutiliza os componentes existentes de listagem, formulário e confirmação.
- API autenticada pelo provider, com renovação de token, cache no-store e descarte de respostas de sessões encerradas. `requisitarEmpresas` aceita apenas as rotas internas de Empresas e recusa X-Empresa-Id: a API administra o escopo autorizado pelo banco, sem ficar restrita à empresa operacional do cabeçalho.
- `/admin/empresas` pode ser acessada por sessão autenticada sem empresa ativa. A consulta e as ações continuam sujeitas às permissões no servidor. Os demais módulos mantêm a exigência de empresa selecionada. O estado global é isolado por usuário.
- Revalidação da descoberta de empresas após gravações, incluindo nome no cabeçalho e inativação da empresa selecionada. O formulário aguarda essa etapa sem desmontar a tela; falha posterior à confirmação da escrita não causa repetição automática do cadastro.

| Ação | Chamada |
| --- | --- |
| Listar | GET `/api/empresas?page=1&limit=10&search=...&cidade=...&status=...&sortBy=...&sortOrder=...` |
| Consultar | GET `/api/empresas/{id}` |
| Criar | POST `/api/empresas` |
| Editar | PATCH `/api/empresas/{id}` apenas com mudanças |
| Inativar | DELETE `/api/empresas/{id}` |
| Reativar | PATCH `/api/empresas/{id}` com status ATIVA |

A listagem normaliza o envelope `success/data/data`, com page, limit, total e totalPages. Consulta e gravação validam o envelope retornado; erros HTTP exibem a mensagem da API. Escritas não são repetidas em erro 409/429/500 ou resposta inválida.

Os schemas de negócio do formulário vêm de `modules/empresas/schema.ts`. Campos opcionais vazios viram null, campos omitidos no PATCH são preservados e valores legados não alterados não bloqueiam outra edição. Status e IDs ficam fora do formulário cadastral. A logo não é baixada automaticamente e a cor tem apenas prévia local; este PR não aplica identidade visual global à sessão.

Criar, mudar CNPJ e alterar situação exigem ADMIN global, validado pelo backend. Edição dos demais campos requer permissão em Empresas no vínculo. A interface não concede administração pelo nome de cargo nem confia em dados do navegador para autorizar.

## Validação de 23/11/2026

- Suite completa: 116 arquivos e 2.186 testes passaram.
- ESLint, TypeScript, Prettier e validação do Prisma passaram. Build de produção Webpack aprovado com NODE_OPTIONS=--use-system-ca. Os cenários de navegador também passaram na aplicação compilada (next start), com API e banco reais.
- Testes reais com MariaDB local descartável: unicidade e criações concorrentes, escopo/permissões, paginação e rollback quando a auditoria falha (4 testes do script de integração, incluindo subtestes).
- Navegador com UI, API e banco reais: administrador sem vínculo ativo; cadastro com submissão duplicada; conferência de persistência; PATCH parcial com null; nome no cabeçalho; inativação da empresa ativa; reativação; usuário comum com escopo restrito e erro 403 preservando formulário; API anônima 401, outro ID 404, alteração indevida de status 403 e ID no payload 400.
- Capturas inspecionadas em tema claro, escuro e celular de 390 px. Dados fictícios; nenhuma credencial nas capturas.
- O banco compartilhado não foi acessado ou alterado. O schema atual foi criado do zero em um banco local com sufixo _test. A implantação do PR #155 em outros ambientes continua a cargo da equipe responsável.

Detalhes da revisão e pendências de dependências: [revisao-empresas.md](revisao-empresas.md).
