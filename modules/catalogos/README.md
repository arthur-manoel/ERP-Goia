# Autorização dos catálogos

As rotas de produtos, cores, tamanhos, tipos de produto e fornecedores usam o verificador Bearer existente em src/lib/authorize.ts. A validação de assinatura e expiração permanece no serviço de autenticação existente.

O repository consulta usuario_empresa a cada requisição, exigindo usuário ATIVO, vínculo ATIVO, empresa ATIVA e permissão explícita da operação. Usuário global ADMIN ou vínculo EMPRESA dispensa o flag, mas nunca o vínculo ativo. A regra compartilhada está em src/lib/permissoes.ts; recurso nulo/inválido nega acesso.

| Módulo | Recurso |
| --- | --- |
| Produtos | PRODUTOS |
| Cores | CORES |
| Tamanhos | TAMANHOS |
| Tipos de produto | TIPOS_PRODUTO |
| Fornecedores | FORNECEDORES |

| Método | Permissão |
| --- | --- |
| GET | pode_ler |
| POST | pode_criar |
| PUT / PATCH | pode_editar |
| DELETE | pode_excluir |

As empresas autorizadas são passadas pelo servidor aos services e usadas nos filtros Prisma de leitura, contagem e escrita. id_empresa enviado pelo cliente é validado contra esse escopo. Escritas por ID incluem o escopo no próprio UPDATE; registros inacessíveis retornam 404. Cores legadas sem empresa e produtos sem produto_empresa não ficam públicos.

Produtos são globais: atualizar/inativar exige permissão em todas as empresas vinculadas. Criar exige id_empresa e gera produto + produto_empresa em escrita aninhada atômica.

Erros seguem { success: false, error }: 401 para token ausente/inválido, 403 para falta de vínculo/permissão ou empresa explicitamente não autorizada. Respostas usam Cache-Control: no-store.

Listagens preservam { success: true, data: { rows, count, page, limit, totalPages } }. O frontend deve consumir data.rows e data.totalPages e fazer uma requisição por mudança de página, busca ou status. Busca vazia não adiciona filtro textual. count usa os mesmos filtros e escopo dos itens; ordenação inclui ID para estabilidade.

As páginas de cores e tamanhos deste checkout ainda são placeholders; não existe nelas um carregamento sequencial de páginas para substituir.

Testes: npm test -- tests/unit/catalogos. São testes unitários com Prisma e verificador JWT simulados; não substituem integração com banco e login reais.

Veja [a matriz de todas as APIs](../../docs/PERMISSOES-API.md) para implantação do DDL e concessões dos novos recursos. Tipos de produto permanecem um catálogo global legado sem id_empresa.
