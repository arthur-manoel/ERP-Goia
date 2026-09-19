# Autenticação e refresh com rotação

## Preparação

1. Configure `DATABASE_URL` e `AUTH_SECRET` em `.env.local`, usando `.env.example`
   como referência. `AUTH_SECRET` deve ser um valor aleatório com pelo menos 32
   bytes; nunca use o segredo dos testes. A aplicação mantém a restrição existente
   ao banco `joseev47_erp_dev`.
2. Execute `npm run db:generate` para gerar o Prisma Client.
3. A tabela `refresh_tokens` já consta em `prisma/schema.prisma`. Para criá-la
   **apenas se estiver ausente no banco local**, execute
   `npm run db:ensure-refresh-tokens`. Esse comando usa Prisma com DDL fixo,
   `CREATE TABLE IF NOT EXISTS` e FK para `usuarios`, que já deve existir.
   Recusa hosts diferentes de localhost, 127.0.0.1 e ::1; não executa migrations,
   db push, exclusões ou alterações de tabelas existentes. Requer a conexão real
   local no `.env.local` e permissão CREATE do usuário MySQL.
4. O login usa `usuarios.email` e `usuarios.senha`, que precisa conter hash bcrypt
   (`$2a$`, `$2b$` ou `$2y$`). Não aceita senha armazenada em texto puro nem cria
   usuários de teste no banco. Usuários inativos não podem abrir ou renovar sessão.

Não foi criada uma segunda tabela chamada `refresh_token`: é reutilizada
`refresh_tokens`, já presente no modelo. O schema Prisma não precisou ser alterado.

## Rotas

| Método e rota | Entrada | Resultado |
| --- | --- | --- |
| POST `/api/auth/login` | JSON `{ "email": "...", "senha": "..." }` | Usuário público e dois cookies |
| POST `/api/auth/refresh` | Cookie HttpOnly `erp_refresh` | Rotaciona cookies e retorna usuário público |
| POST `/api/auth/logout` | Cookie `erp_refresh` | Revoga sessão e limpa cookies |
| GET `/api/auth/me` | Cookie `erp_access` | Retorna usuário da sessão ativa |

Respostas seguem `{ success, data?, error? }` e `Cache-Control: no-store`.
Nenhuma resposta JSON contém senha, hash ou token. As escritas exigem header
`Origin` igual à origem da URL da API, inclusive login, refresh e logout. O
navegador envia esse header automaticamente; clientes de testes/CLI precisam
informá-lo. JSON inválido retorna 400, sessão inválida 401, origem inválida 403,
falhas internas 500. O login possui limite em memória de 10 tentativas por email
em 15 minutos (429); em implantação com múltiplas instâncias, substitua esse
armazenamento por um limitador compartilhado.

## Sessão e rotação

- Access token JWT HS256: 15 minutos, issuer/audience fixos, sujeito e ID de sessão.
  Toda autenticação também confirma no banco a sessão não revogada/não expirada
  e o usuário ativo. Logout invalida o acesso imediatamente.
- Refresh token opaco: 32 bytes aleatórios. Apenas SHA-256 fica em `token` no banco.
  Validade absoluta de 7 dias, preservada em cada rotação.
- Uma transação consulta o token, revoga condicionalmente o registro anterior e
  cria o sucessor. O UPDATE condicional impede dois sucessores para o mesmo token.
- Reutilizar um token revogado provoca revogação de **todas as sessões desse
  usuário**, inclusive outros dispositivos. Como a tabela atual não tem coluna
  de família de sessão, essa é a política conservadora adotada. A revogação é
  confirmada antes de o service lançar o erro 401.
- Os cookies são HttpOnly e SameSite=Strict, com Secure em produção. Access usa
  path `/`; refresh usa `/api/auth`. Tokens nunca são guardados em localStorage.
- Registros revogados permanecem até a expiração para detectar reutilização.
  Uma rotina de manutenção pode remover registros já expirados depois disso.
- Tokens antigos armazenados em texto puro por outra implementação não são
  aceitos; esses usuários precisam entrar novamente.

## Integração no sistema

`src/proxy.ts` protege páginas e APIs, exceto `/login`, login, refresh, logout e
assets estáticos. Páginas sem sessão vão para `/login`, que tenta renovar a sessão
antes de apresentar o formulário. Os handlers de produtos e tamanhos também
verificam autenticação diretamente, sem depender só do Proxy.

Para chamadas do frontend, use `authFetch` de `lib/auth/client` no lugar de fetch:

```ts
const response = await authFetch("/api/tamanhos?id_empresa=10");
```

O helper tenta renovar após 401 e repete a requisição uma única vez. Compartilha
uma renovação entre chamadas simultâneas e usa Web Locks para coordenar abas
quando disponível. Em navegadores sem Web Locks, abas simultâneas podem exigir
novo login pela política estrita de reutilização. Não há retentativa de escritas
que já retornaram sucesso, nem retentativa infinita de refresh.

Produtos mantém seu catálogo global existente, acessível a usuários autenticados.
Tamanhos aplica adicionalmente o vínculo de empresa. Novos módulos devem usar
`authenticated()` no handler e implementar as próprias regras de autorização.

Testes: `npm test -- tests/unit/auth`. Os testes não se conectam ao banco.
