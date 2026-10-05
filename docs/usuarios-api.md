# Cadastro de funcionários — POST /api/usuarios

Rota administrativa para criar usuário e vínculo com a empresa. Usa as tabelas existentes `usuarios`, `usuario_empresa`, `cargos`, `setores` e `auditoria`. Não requer alteração de schema/migrations nem de front-end. As correções de setores/fluxos permanecem intactas.

## Thunder Client

Com o servidor iniciado (`npm run dev`), autentique um administrador em `POST /api/auth/login` com `email` e `password`. Copie `accessToken` e envie:

```http
POST http://localhost:3000/api/usuarios
Authorization: Bearer <accessToken>
X-Empresa-Id: 10
Content-Type: application/json
```

```json
{
  "nome": "Maria Silva",
  "email": "maria@example.com",
  "password": "UmaSenhaForte123!",
  "idCargo": 2,
  "idSetor": 7
}
```

Use IDs de cargo/setor ativos da empresa selecionada. Setor é opcional: omitir `idSetor` ou enviar null. Não enviar nível de acesso, status, perfil, permissões ou empresa no corpo. Campos desconhecidos são rejeitados.

- Nome: 1–150 caracteres após trim.
- E-mail: válido, até 150 caracteres após trim, normalizado para minúsculas.
- Senha: 8–128 caracteres, sem trim, armazenada com Argon2id.
- IDs: inteiros positivos até 2147483647.

## Autorização e login

Exige Bearer; cookies não autenticam esta rota. O solicitante precisa de vínculo ativo com empresa ativa e nível global ADMIN ou nível EMPRESA naquele vínculo. Ter apenas perfil funcional ADMINISTRACAO não basta. A autorização é revalidada dentro da transação. O header pode ser omitido se houver somente um vínculo ativo.

O funcionário é criado ATIVO, com nível **USUARIO** tanto no usuário quanto no vínculo. Nenhuma permissão de operação é concedida automaticamente; APIs que verificam permissões continuarão negando ações não autorizadas. Não há cadastro público nem criação de administrador por esta rota.

O resolvedor de login existente usa nome do cargo e nome/tipo do setor. A combinação precisa indicar exatamente um perfil reconhecido: ADMINISTRACAO, PRODUCAO, VENDAS ou FINANCEIRO. Também são aceitos os aliases existentes Administrativo e Comercial. Cargo Produção com setor Corte de tipo Produção é válido. Cargo Auxiliar sem setor reconhecido, ou cargo Vendas com setor Produção, retorna 422 para evitar criar usuário sem login válido.

## Resposta 201

```json
{
  "usuario": {
    "id": 20,
    "nome": "Maria Silva",
    "email": "maria@example.com",
    "nivel_acesso": "USUARIO",
    "status": "ATIVO",
    "data_cadastro": "2026-10-04T12:00:00.000Z",
    "usuario_empresa": [
      {
        "id": 30,
        "id_empresa": 10,
        "id_cargo": 2,
        "id_setor": 7,
        "nivel_acesso": "USUARIO",
        "status": "ATIVO"
      }
    ]
  },
  "perfil": "PRODUCAO"
}
```

Senha e hash não aparecem na resposta nem na auditoria. Não retorna token: faça login com o email retornado e a senha cadastrada usando `/api/auth/login`.

## Erros

Formato `{ "error": "mensagem" }`; respostas com `Cache-Control: no-store`.

| Status | Situação |
| --- | --- |
| 400 | JSON/dados inválidos, campos extras, senha curta ou múltiplas empresas sem seleção |
| 401 | Token ausente/inválido |
| 403 | Sem vínculo ativo ou sem nível de administrador |
| 404 | Cargo/setor inexistente, inativo ou de outra empresa |
| 409 | E-mail duplicado, conflito de unicidade/FK ou disputa concorrente |
| 422 | Cargo/setor sem perfil único reconhecido pelo login |
| 500 | Falha interna; transação revertida |

O e-mail é globalmente único: não vincula nem altera usuário preexistente, inclusive inativo ou de outra empresa. Cadastro, vínculo e auditoria são atômicos com isolamento Serializable. O tratamento de conflitos reutiliza a correção para o Prisma 7/adapter já existente no projeto.

## Arquivos e testes

Criados: `src/app/api/usuarios/route.ts`, `src/modules/usuarios/{router,usuarios.authorization,usuarios.repository,usuarios.schema,usuarios.service}.ts`, `tests/usuarios.test.mjs` e este documento.

Executar `node --test tests/usuarios.test.mjs`, `npm run typecheck` e ESLint nos arquivos novos. Testes usam persistência em memória, hash real e adaptador de autenticação existente: cobrem privilégio, isolamento, validação, duplicidade, rollback e compatibilidade com login. Não cadastram usuários no banco real.
