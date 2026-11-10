# Empresas da sessão — issue #12

`GET /api/auth/empresas` descobre os vínculos antes de selecionar uma empresa.
Usa `Authorization: Bearer <accessToken>` emitido pelo login real. Não exige
`X-Empresa-Id`, cookie de empresa ou permissão de qualquer módulo.

## Contrato

```json
{
  "success": true,
  "data": {
    "usuario": { "id": 12, "nome": "Pessoa", "email": "pessoa@example.test" },
    "empresas": [{ "id": 35, "nome": "Empresa" }]
  }
}
```

Usuário: id estável para a preferência, nome/e-mail usados no menu da conta.
Empresa: somente id e razão social apresentada como nome. Sem permissões,
credenciais, CNPJ ou registros completos do banco.

Critérios: `usuarios.status = ATIVO`, `usuario_empresa.status = ATIVO` e
`empresas.status = ATIVA`. Ordenação crescente por id de empresa; lista sem
repetição, apoiada também na unicidade existente de usuário/empresa. Não há
filtro por cargo, setor ou recurso. Os quatro perfis de login atuais são aceitos.
Mesmo ADMIN recebe somente os próprios vínculos; não há nova exceção administrativa.

Usuário ativo com JWT válido e nenhum vínculo elegível recebe 200 e `empresas: []`.
O login continua seguindo a resolução de perfil já existente: não cria perfil
ou vínculo para quem não consegue autenticar. JWT ausente/inválido/expirado,
usuário removido ou inativo retorna 401. Query não prevista, inclusive id_usuario,
retorna 400; identidade vem exclusivamente do JWT. Header de empresa não muda a
consulta. Método diferente de GET/HEAD recebe o tratamento padrão do framework.
Falha de infraestrutura é 500 com envelope de erro, nunca uma lista vazia.

Respostas usam `Cache-Control: private, no-store` e `Vary: Authorization`
(além dos valores adicionados pelo Next). Não existe cache global de empresas.
A rota `/api/auth/contexto` permanece compatível para consumidores anteriores;
o provedor de autenticação usa exclusivamente `/api/auth/empresas`.

## Provedor e seleção

Login e restauração/renovação consultam a nova rota usando o token, sem passar
pelo helper que exige empresa. Tokens de acesso continuam somente em memória;
a renovação continua usando o cookie HttpOnly e a fila de sessão existente.
Na inicialização, uma empresa única é selecionada automaticamente. Com várias empresas, restaura
somente uma escolha válida ou pede seleção explícita antes de montar os módulos.
O cabeçalho comum permite trocar de empresa.

A preferência usa sessionStorage `erp-goia-empresa-ativa:<idUsuario>`. A chave
antiga sem identidade é descartada. Quando o vínculo ativo sai da lista, a
operação pendente é interrompida e a pessoa escolhe novamente, mesmo quando
resta uma só empresa. A renovação preserva a última
empresa selecionada em memória se a consulta confirmar que ela continua válida.
Com armazenamento indisponível, a seleção funciona na página aberta. Após
uma recarga completa, a empresa única é selecionada automaticamente e, se
houver várias empresas, a interface pede uma nova escolha. Logout limpa o
contexto imediatamente, cancela a
consulta e remove a preferência do usuário. Respostas atrasadas são descartadas
por cancelamento e geração/identidade da sessão, inclusive após outro login.
O canal de sessão, quando disponível, informa às outras abas sobre login e logout.

Carregamento, ausência de vínculos, erro e expiração têm tratamentos diferentes.
Lista vazia mostra orientação sobre o vínculo; erro de rede/servidor oferece
nova tentativa. Refresh 401 encerra a sessão; falha de infraestrutura não se
passa por credencial inválida. Durante uma falha temporária de renovação ou
consulta, a página e a seleção em memória permanecem. A requisição informa a
falha e só repete a operação depois de validar a identidade e os vínculos.
A rota protegida não monta módulos enquanto falta
um contexto válido. Renovação revalida a lista e não repete uma operação antiga
se a pessoa ou a empresa mudou. O helper normaliza Headers sem duplicar
X-Empresa-Id quando a tela já o informou.

Selecionar uma empresa não concede permissões. `/api/estoque-minimo/empresas`
continua restrita ao estoque; suas regras e as dos demais módulos permanecem.

## Banco e testes

Sem alteração de schema ou migration: utiliza os vínculos e estados existentes.
Para integração, prepare MySQL/MariaDB **local e exclusivo**, com o schema atual,
e configure AUTH_EMPRESAS_TEST_DATABASE_URL (host local, banco com sufixo _test).
Nunca execute os testes de escrita no banco compartilhado/produção.

```text
npm test -- tests/unit/autenticacao tests/unit/clientes/contexto-auth.test.ts
npm run db:generate
npm run db:validate
npm run build
node tests/auth-empresas.integration.test.mjs
npm run lint
npm run format:check
npm run typecheck
```

Os testes do provedor montam React no jsdom e simulam somente a rede: verificam
seleção, recarregamento, falhas, renovação e respostas atrasadas. A suíte HTTP
exige build atual, login e adapter reais, cria fixtures sintéticas com permissões
explícitas e remove somente seus próprios registros. Inclui vendas, financeiro,
múltiplas empresas, ausência de vínculos, isolamento/cache e preservação de 403
no estoque. Resultados observados e validação visual ficam na descrição da PR;
nenhuma captura ou relatório de evidência é versionado.
