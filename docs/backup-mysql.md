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

Para validar manualmente, execute `npm run db:backup` no terminal do VS Code. Uma execução diária exige que o computador ou servidor esteja ligado no horário programado. No Windows, crie uma tarefa no Agendador de Tarefas para iniciar `npm.cmd` com o argumento `run db:backup` e defina **Iniciar em** como a pasta do projeto. No Linux, use cron no servidor que tenha acesso remoto ao MySQL.

Os arquivos ficam na máquina que executou o comando. Configure uma cópia para armazenamento separado e protegido, pois falha ou perda dessa máquina também pode levar os backups locais. Faça testes de restauração periodicamente.

O dump usa `--single-transaction`, apropriado para tabelas InnoDB, e inclui rotinas, eventos e gatilhos. A configuração atual do projeto informa que o banco não possui triggers nem procedures, mas as opções mantêm esses objetos incluídos caso isso mude.
