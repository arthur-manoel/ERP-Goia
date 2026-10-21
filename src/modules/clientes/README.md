# API de clientes

Backend com router/schema/service/repository, reutilizando `clientes`, `venda`, `usuario_empresa`, `permissoes_usuario` e `auditoria`. Não requer alteração de frontend, schema, migrations ou novos registros de permissão.

## Autenticação, empresa e permissões

Bearer JWT obrigatório. Perfis aceitos: `ADMINISTRACAO` e `VENDAS`. Toda operação consulta usuário, empresa e vínculo ativos no banco.

`X-Empresa-Id` seleciona a empresa entre os vínculos ativos. Com um único vínculo, pode ser omitido. Com múltiplos vínculos, a omissão retorna 400. Empresa não autorizada retorna 403, inclusive para administradores. IDs de clientes inexistentes ou pertencentes a outra empresa retornam 404 na empresa selecionada. O corpo e a query não podem determinar `id_empresa`.

O enum `permissoes_usuario_recurso.CLIENTES` e as colunas `pode_ler`, `pode_criar`, `pode_editar`, `pode_excluir` **já existem no schema**. Este módulo não cria nem concede permissões. Usuários comuns sem a permissão necessária recebem 403. Eventual concessão exige operação administrativa separada e autorização prévia do responsável; não exige migration.

| Operação | Permissão CLIENTES |
| --- | --- |
| Listar, consultar, histórico | `pode_ler` |
| Cadastrar | `pode_criar` |
| Editar e reativar | `pode_editar` |
| Inativar por DELETE | `pode_excluir` |
| Enviar `status: INATIVO` por POST/PATCH | Permissão da operação **e** `pode_excluir` |

VENDAS pode inativar quando tem `pode_excluir`; a operação não é exclusiva de ADMINISTRACAO. Conforme o padrão de produção, usuário com `usuarios.nivel_acesso = ADMIN` ou vínculo com `nivel_acesso = EMPRESA` dispensa as permissões individuais, mas continua precisando de perfil permitido e vínculo ativo. O perfil ADMINISTRACAO sozinho não concede essa exceção.

## Contrato

| Método e rota | Resultado |
| --- | --- |
| `POST /api/clientes` | 201, `{ cliente }` |
| `PATCH /api/clientes/{id}` | 200, `{ cliente }` |
| `GET /api/clientes` | 200, `{ clientes, paginacao }` |
| `GET /api/clientes/{id}` | 200, `{ cliente }` |
| `DELETE /api/clientes/{id}` | 200, `{ cliente }` com `status: INATIVO` |
| `GET /api/clientes/{id}/pedidos` | 200, `{ idCliente, pedidos, paginacao }` |

DELETE realiza inativação lógica, preservando cliente e vendas; repetir a chamada mantém o cliente inativo. PATCH com `status: ATIVO` reativa. Clientes inativos continuam consultáveis e seus documentos continuam reservados na empresa.

Respostas usam os campos persistidos em snake_case e acrescentam `tipoPessoa`. Datas são ISO 8601; valores monetários são strings decimais. Todas as respostas dos handlers incluem `Cache-Control: no-store`.

### Cadastro e edição

Entrada em camelCase; apenas `nomeRazaoSocial` é obrigatório no POST. PATCH exige ao menos um campo e preserva campos omitidos.

| Campo | Regra |
| --- | --- |
| `nomeRazaoSocial` | 1–150 caracteres após trim |
| `cpfCnpj` | CPF/CNPJ válido, com ou sem máscara padrão; opcional e anulável |
| `email` | E-mail válido, até 150 caracteres |
| `telefone` | Até 30 caracteres |
| `endereco` | Até 255 caracteres |
| `numero` | Até 20 caracteres |
| `complemento`, `bairro`, `cidade` | Até 100 caracteres cada |
| `estado` | UF brasileira, normalizada para maiúsculas |
| `cep` | 8 dígitos ou máscara `00000-000`; persistido sem máscara |
| `status` | `ATIVO` ou `INATIVO`; padrão do banco é `ATIVO` |

Campos opcionais de documento, contato e endereço aceitam `null` para remoção. Documento, e-mail, UF e CEP vazios são inválidos: use `null`. Campos desconhecidos, inclusive `idEmpresa`, `id_empresa`, `tipoPessoa`, IDs e datas de cadastro, são rejeitados. Não é possível transferir um cliente de empresa pela API.

```json
{
  "nomeRazaoSocial": "Cliente exemplo",
  "cpfCnpj": "529.982.247-25",
  "email": "cliente@example.test",
  "estado": "PE",
  "cep": "50000-000"
}
```

### CPF/CNPJ e tipo de pessoa

CPF exige 11 dígitos e dois verificadores válidos por módulo 11. CNPJ admite o numérico e o alfanumérico: 12 caracteres de base (`A-Z`/`0-9`) mais dois verificadores numéricos. No CNPJ, a conversão usa ASCII menos 48 e pesos de 2 a 9. Sequências numéricas integralmente repetidas são rejeitadas. A validação verifica formato e DVs, sem consultar situação cadastral na Receita.

Aceitam-se a forma compacta e as máscaras padrão de CPF/CNPJ, além de espaços nas extremidades. Caracteres indevidos são rejeitados antes da normalização. Persistência sem máscara, com zeros iniciais preservados e letras maiúsculas. A busca de duplicidade também compara legados com pontos, barra, hífen, espaços e letras minúsculas. Nenhum saneamento em massa de legados é executado.

**`tipoPessoa` é uma inferência pelo documento, não um dado cadastral real.** Retorna `FISICA` para CPF válido e `JURIDICA` para CNPJ válido. Clientes sem documento recebem `tipoPessoa: null`, mesmo que sejam PF ou PJ. Documentos legados inválidos também resultam em `null`. O campo não é aceito na entrada nem persistido, pois não existe coluna correspondente.

Referências oficiais: [CNPJ alfanumérico](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/julho/receita-federal-gera-o-primeiro-cnpj-em-formato-alfanumerico) e [cálculo do DV](https://normas.receita.fazenda.gov.br/sijut2consulta/anexoOutros.action?idArquivoBinario=76204).

### Listagem

`GET /api/clientes?nome=Maria&cpfCnpj=52998224725&status=ATIVO&pagina=1&limite=20`

Filtros combinados: nome por correspondência parcial literal (sensibilidade a maiúsculas/acentos conforme a collation do banco), documento completo normalizado e status exato. Sem status, inclui ativos e inativos. Nome ordenado ascendentemente, com ID ascendente como desempate.

Paginação começa em 1; limite padrão 20, máximo 100. Parâmetros desconhecidos, repetidos, vazios ou inválidos retornam 400. Contagem e página usam o mesmo snapshot transacional. Página além do total retorna lista vazia. Sem resultados, `totalPaginas` é 0.

```json
{
  "clientes": [],
  "paginacao": { "pagina": 1, "limite": 20, "total": 0, "totalPaginas": 0 }
}
```

### Histórico comercial

`GET /api/clientes/{id}/pedidos?pagina=1&limite=20`

O schema não possui model Pedido comercial; o relacionamento existente é `clientes.venda`. O nome público `pedidos` representa essas vendas, incluindo todos os status. `pedido_compra` é de fornecedores e não participa deste histórico. A consulta filtra tanto o cliente quanto `venda.id_empresa`, pois a FK isoladamente não garante a mesma empresa.

Ordenação por `data_venda DESC, id DESC`. Retorna resumo paginado, sem expandir `item_venda`. Cliente sem vendas retorna `pedidos: []`; cliente inexistente na empresa retorna 404.

```json
{
  "idCliente": 42,
  "pedidos": [
    {
      "id": 150,
      "numero": "VEN-150",
      "status": "CONFIRMADA",
      "data_venda": "2026-09-22T12:00:00.000Z",
      "data_entrega": null,
      "valor_total": "1250.00"
    }
  ],
  "paginacao": { "pagina": 1, "limite": 20, "total": 1, "totalPaginas": 1 }
}
```

## Concorrência e dívidas técnicas para o responsável pelo banco

Todas as escritas destas rotas usam transação Serializable e adquirem primeiro `SELECT ... FOR UPDATE` na linha da empresa. A verificação do documento, a gravação e a auditoria ocorrem dentro da mesma transação. O bloqueio no banco funciona entre processos da aplicação e serializa as escritas do módulo por empresa. Falhas desfazem a transação inteira. Conflitos retornam 409, sem repetição automática.

1. **Unicidade de documento por empresa:** atualmente não existe constraint. A trava coordenada pela aplicação **só protege entradas via estas rotas**; importações, outros módulos ou SQL direto que não seguem o protocolo podem criar duplicidade. É uma dívida técnica, não uma garantia global do banco. Proposta ao responsável: `@@unique([id_empresa, cpf_cnpj], map: "uk_cliente_empresa_documento")`. Antes da constraint, inventariar documentos, normalizar valores, resolver duplicados por empresa e padronizar os demais escritores. A constraint isolada não torna máscaras diferentes equivalentes. Documentos nulos podem continuar múltiplos. Não foi criado índice, migration nem executado saneamento.
2. **Tipo de pessoa persistido:** avaliar uma coluna `tipo_pessoa` independente de CPF/CNPJ, com valores PF/PJ a definir com o responsável e plano de preenchimento dos legados. Isso permitirá distinguir clientes sem documento. Até lá, `tipoPessoa` é somente a inferência descrita acima. Nenhuma coluna foi criada.

Qualquer alteração estrutural depende de confirmação específica do responsável pelo banco.

## Erros

Sempre `{ "error": "mensagem" }`: 400 entrada inválida/empresa não selecionada, 401 autenticação ausente/inválida, 403 acesso negado, 404 cliente não encontrado na empresa, 409 documento duplicado ou conflito transacional/referencial.

Falhas inesperadas retornam exclusivamente **500 `{ "error": "Erro interno" }`**. O erro completo, incluindo stack quando disponível, vai somente para `console.error` no servidor; nunca para a resposta HTTP.

## Verificação

```bash
node tests/clientes.test.mjs
node tests/clientes.integration.test.mjs
# Usa exclusivamente MySQL local e schema já preparado:
node tests/clientes.integration.test.mjs --configured-db
```

Também é possível definir `CLIENTES_TEST_DATABASE_URL`; sem URL explícita ou `--configured-db`, a integração é marcada como ignorada. A integração chama os Route Handlers reais com Request/Response e Prisma real, sem iniciar um servidor HTTP. Exercita concorrência de cadastros e edição/cadastro, isolamento, máscaras legadas, histórico, paginação, vínculos ativos, auditoria e rollback.

Fixtures são criadas em empresas próprias e removidas ao final. Não há DDL, migrations, seed ou criação de registros de permissão. Testes unitários exercitam concessões/negações de CLIENTES com dados simulados e verificam que 500 não expõe detalhes internos.
