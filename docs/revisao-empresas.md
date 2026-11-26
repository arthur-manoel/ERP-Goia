# Revisão da integração de Empresas — 23/11/2026

## Correções da entrega

1. Gestão global não podia usar o helper operacional, que exige e injeta a empresa ativa. O transporte específico de Empresas compartilha o ciclo seguro de sessão, aceita somente rotas internas do módulo e recusa o cabeçalho que restringiria a listagem ou impediria consultar outro cadastro autorizado.
2. A proteção do layout bloqueava a administração sem empresa ativa. A exceção ficou limitada a /admin/empresas, com autenticação obrigatória e autorização mantida no backend. Há acesso à gestão pelo estado de seleção de empresa; outros módulos continuam bloqueados sem seleção.
3. Mudanças na empresa selecionada não devem desmontar o cadastro global. A chave da tela global acompanha o usuário; respostas após logout ou troca de sessão são descartadas.
4. Teste real revelou que a atualização da sessão após salvar podia continuar depois de fechar o diálogo; uma recarga nesse intervalo podia perder o cookie rotacionado. A gravação agora aguarda a revalidação com a tela mantida. O caso de erro posterior à escrita confirmada não provoca novo POST. Não há garantia de conclusão de requisições interrompidas enquanto o usuário força uma navegação com uma operação ainda pendente.
5. Regras duplicadas foram substituídas pelos schemas puros da API aprovada. PATCH parcial preserva campos não modificados, admite limpeza explícita e protege IDs/status. Edição sem mudanças não gera escrita nem confirmação fictícia.

## Verificações de segurança e consistência

| Cenário | Evidência |
| --- | --- |
| Autenticação e escopo | UI/API/MariaDB: acesso anônimo 401, usuário comum consulta somente seu escopo, outro ID retorna 404 em leitura e exclusão |
| Elevação de privilégio | Backend real bloqueia status para usuário comum (403), criação sem ADMIN (403) e campos protegidos (400) |
| Injeção de destino no helper | Testes recusam URL externa, protocolo relativo, traversal e rotas fora do módulo antes de fazer fetch |
| Sessão | Testes de 401/renovação sem X-Empresa-Id, logout com resposta pendente e cadastro sem empresa ativa; módulos operacionais preservam seleção obrigatória |
| Payload e apresentação | Schemas compartilhados, CNPJ verificado, HTTPS sem credenciais, cor hexadecimal e textos renderizados por React; sem HTML arbitrário ou download de logo |
| Duplicidade | Trava síncrona no formulário; UI real enviou um POST no duplo submit; teste no banco confirmou 201/409 em duas criações concorrentes |
| Atomicidade | Teste MariaDB com falha induzida na auditoria confirmou rollback da edição e inativação |
| Falhas e dados antigos | 403/409/429/500 e resposta inválida sem retry automático; PATCH parcial/null e histórico legado; falha de revalidação após sucesso não reenvia gravação |

A revisão cobre os caminhos e testes descritos, sem equivaler a pentest completo ou prova de ausência de vulnerabilidades no sistema inteiro.

## Resultado final dos checks

116 arquivos / 2.186 testes unitários passaram, além de 4 testes de integração do script MariaDB (incluindo subtestes). ESLint, tipos, Prettier, schema e build Webpack passaram. O fluxo de navegador sem mocks passou em desenvolvimento e na aplicação compilada para produção. O banco utilizado foi exclusivamente local e descartável.

## Dependências: achados preexistentes

O comando npm audit --omit=dev --json apontou 24 alertas nas dependências de produção: 1 crítico, 14 altos e 9 moderados. Package.json e lockfile não foram alterados por esta integração; os achados já pertencem à base utilizada.

Há alertas críticos no pacote Next.js 16.3.5, além de alertas em Zod e cadeias ligadas a Prisma/MariaDB e shadcn. Referências retornadas pelo auditor incluem [ImageResponse](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j), [otimização de imagens SVG](https://github.com/advisories/GHSA-2464-fhr4-w9xw) e [validação de coleções no Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

Esses achados permanecem pendentes de manutenção das dependências com validação do projeto inteiro. Não foi aplicado npm audit fix --force nem feita atualização global de framework neste PR de Empresas. Não foi demonstrada exploração dos alertas e não se deve interpretar o CI verde como resolução desses riscos.
