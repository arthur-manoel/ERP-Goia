# Autorização dos catálogos

As rotas de produtos, cores e tamanhos usam o verificador Bearer existente em src/lib/authorize.ts. A validação de assinatura e expiração permanece no serviço de autenticação existente.

O repository consulta usuario_empresa a cada requisição, exigindo usuário ATIVO, vínculo ATIVO, empresa ATIVA e permissão explícita da operação. Preserva as exceções existentes para usuário global ADMIN e vínculo EMPRESA; cargo e perfil funcional do JWT não substituem essas verificações. Recurso ou ação ausente/inválido falha fechado.

| Módulo | Recurso |
| --- | --- |
| Produtos | PRODUTOS |
| Cores | CORES |
| Tamanhos | TAMANHOS |
| Tipos de produto | TIPOS_PRODUTO |
| Fornecedores | FORNECEDORES |
| Categorias | CATEGORIAS |

| Método | Permissão |
| --- | --- |
| GET | pode_ler |
| POST | pode_criar |
| PUT / PATCH | pode_editar |
| DELETE | pode_excluir |

POST/PUT/PATCH que inativam produtos, cores, tamanhos, tipos ou fornecedores
exigem também `pode_excluir`. Categorias e financeiro mantêm a proteção própria
equivalente. Header `X-Empresa-Id`, se presente, restringe o escopo autorizado.
Veja a [matriz completa](../../docs/permissoes-modulos.md).

As empresas autorizadas são passadas pelo servidor aos services e usadas nos filtros Prisma de leitura, contagem e escrita. id_empresa enviado pelo cliente é validado contra esse escopo. Escritas por ID incluem o escopo no próprio UPDATE; registros inacessíveis retornam 404. Cores legadas sem empresa e produtos sem produto_empresa não ficam públicos.

Produtos são globais: atualizar/inativar exige permissão em todas as empresas vinculadas. Criar exige id_empresa e gera produto + produto_empresa em escrita aninhada atômica.

Erros seguem { success: false, error }: 401 para token ausente/inválido, 403 para falta de vínculo/permissão ou empresa explicitamente não autorizada. Respostas usam Cache-Control: no-store.

Listagens preservam { success: true, data: { rows, count, page, limit, totalPages } }. O frontend deve consumir data.rows e data.totalPages e fazer uma requisição por mudança de página, busca ou status. Busca vazia não adiciona filtro textual. count usa os mesmos filtros e escopo dos itens; ordenação inclui ID para estabilidade.

As páginas de cores e tamanhos deste checkout ainda são placeholders; não existe nelas um carregamento sequencial de páginas para substituir.

Testes: npm test -- tests/unit/catalogos. São testes unitários com Prisma e verificador JWT simulados; não substituem integração com banco e login reais.
