# Backup diário do MySQL

O comando `npm run db:backup` executa `mysqldump` usando a conexão `DATABASE_URL` já configurada em `.env.local`, comprime o dump em gzip e grava o arquivo em `.backups/mysql/`. A pasta é ignorada pelo Git. Por padrão, remove arquivos com mais de 30 dias; ajuste com `MYSQL_BACKUP_RETENTION_DAYS` ou `MYSQL_BACKUP_DIR`.

## Requisitos

- Instalar o cliente MySQL que fornece `mysqldump` na máquina que fará o backup.
- Essa máquina precisa conseguir conectar ao host MySQL. A hospedagem pode exigir que o IP seja autorizado no painel.
- O usuário do banco precisa poder ler as tabelas e views e consultar gatilhos. A hospedagem pode limitar esses privilégios.
- Mantenha `.env.local` fora do Git. A senha é escrita apenas em um arquivo temporário durante a execução, que é removido ao final.

Se o Windows não encontrar `mysqldump` no PATH, defina `MYSQLDUMP_PATH` com o caminho completo para `mysqldump.exe`. Exemplo PowerShell:

```powershell
$env:MYSQLDUMP_PATH = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe'
npm run db:backup
```

Para validar manualmente no computador de desenvolvimento, execute `npm run db:backup` no terminal do VS Code. Uma execução diária exige que a máquina esteja ligada no horário programado.

## Agendar pelo cPanel

Como o MySQL está na hospedagem cPanel, o cron pode executar o dump no próprio servidor, sem depender de conexões MySQL remotas nem do Next.js. O provedor precisa permitir **Cron Jobs** e disponibilizar `mysqldump` no terminal.

1. No cPanel, confirme o nome completo do banco e do usuário MySQL (hospedagens cPanel costumam acrescentar o prefixo da conta). Confirme também que o usuário está associado ao banco com as permissões necessárias.
2. Em **Terminal**, procure os executáveis (alguns provedores MariaDB chamam o utilitário de `mariadb-dump`):

   ```bash
   command -v mysqldump
   command -v mariadb-dump
   command -v gzip
   ```

3. Crie um arquivo privado de opções MySQL fora de `public_html`, por exemplo `/home/USUARIO_CPANEL/.my.cnf`:

   ```ini
   [client]
   host=localhost
   user=PREFIXO_USUARIO_MYSQL
   password="SENHA_DO_BANCO"
   ```

   Use o host informado pela hospedagem se não for `localhost`. Restrinja o arquivo: `chmod 600 /home/USUARIO_CPANEL/.my.cnf`.
4. Envie `scripts/backup-mysql-cpanel.sh` para uma pasta fora de `public_html`, por exemplo `/home/USUARIO_CPANEL/bin/backup-mysql-cpanel.sh`. Crie também a pasta de destino, por exemplo `/home/USUARIO_CPANEL/backups/mysql`.
5. Execute uma vez pelo Terminal para validar, trocando os valores de exemplo pelos dados do cPanel:

   ```bash
   MYSQL_BACKUP_DATABASE='PREFIXO_BANCO' \
   MYSQL_BACKUP_CNF='/home/USUARIO_CPANEL/.my.cnf' \
   MYSQL_BACKUP_DIR='/home/USUARIO_CPANEL/backups/mysql' \
   MYSQLDUMP_BIN='/CAMINHO/RETORNADO/PELO/COMMAND-V/mysqldump' \
   GZIP_BIN='/CAMINHO/RETORNADO/PELO/COMMAND-V/gzip' \
   /bin/bash /home/USUARIO_CPANEL/bin/backup-mysql-cpanel.sh
   ```

   Confirme que apareceu um `.sql.gz` na pasta e que o comando terminou com `Backup criado`.
6. No cPanel, abra **Cron Jobs** e escolha executar diariamente. Exemplo às 02:00 (horário do servidor):

   ```cron
   0 2 * * * MYSQL_BACKUP_DATABASE='PREFIXO_BANCO' MYSQL_BACKUP_CNF='/home/USUARIO_CPANEL/.my.cnf' MYSQL_BACKUP_DIR='/home/USUARIO_CPANEL/backups/mysql' MYSQL_BACKUP_RETENTION_DAYS=30 MYSQLDUMP_BIN='/CAMINHO/mysqldump' GZIP_BIN='/CAMINHO/gzip' /bin/bash /home/USUARIO_CPANEL/bin/backup-mysql-cpanel.sh >> /home/USUARIO_CPANEL/backups/mysql/cron.log 2>&1
   ```

   Substitua todos os caminhos e prefixos. O cPanel pede o horário em campos separados; informe minuto `0`, hora `2` e `*` nos campos dia, mês e dia da semana. Use caminhos absolutos, pois o ambiente do cron é limitado. A documentação do [cPanel Cron Jobs](https://docs.cpanel.net/cpanel/advanced/cron-jobs/) detalha o agendamento e a exigência de caminhos absolutos.

O script salva arquivos compactados com permissão privada, valida a integridade gzip e remove cópias com mais de 30 dias. As credenciais ficam no `.my.cnf`, não no comando do cron. Os backups permanecem na hospedagem; uma cópia em outro armazenamento protege contra perda da própria conta/servidor.

Os arquivos ficam na máquina que executou o comando. Configure uma cópia para armazenamento separado e protegido, pois falha ou perda dessa máquina também pode levar os backups locais. Faça testes de restauração periodicamente.

O dump usa `--single-transaction`, apropriado para tabelas InnoDB, e inclui rotinas, eventos e gatilhos. A configuração atual do projeto informa que o banco não possui triggers nem procedures, mas as opções mantêm esses objetos incluídos caso isso mude.
