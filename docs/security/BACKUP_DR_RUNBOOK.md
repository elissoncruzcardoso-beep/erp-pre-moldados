# Runbook de Backup e Disaster Recovery

Este runbook define como operar backup do PRECAST ERP sem salvar segredos no repositorio.

## Decisao atual

Neste momento o projeto usa backup local no servidor/CT da empresa.

Nao precisa de AWS agora.

O backup fica em uma pasta fora do projeto, por exemplo:

- Linux/Proxmox CT: `/var/backups/precast-erp`
- Windows: `C:\precast-backups`

Essa pasta precisa entrar no backup em nuvem que a empresa ja usa. Se ela ficar somente no mesmo servidor, ainda existe risco em caso de perda, invasao ou defeito fisico.

## Arquivos que nunca entram no Git

Nao commitar:

- `/etc/precast-erp/precast-backup.env`;
- `C:\seguro\precast-backup.env`;
- dumps `.dump`;
- checksums reais `.sha256`;
- connection strings completas;
- tokens, senhas ou chaves;
- logs com variaveis de ambiente.

O template publico fica em:

`docs/security/backups/precast-backup.env.template`

## Preparacao no Proxmox CT

1. Instalar Node.js.
2. Instalar Git.
3. Instalar PostgreSQL Client Tools com `pg_dump`, `pg_restore` e `psql`.
4. Baixar/clonar o projeto.
5. Rodar `npm install`.
6. Criar a pasta segura:

```bash
sudo mkdir -p /etc/precast-erp
sudo mkdir -p /var/backups/precast-erp
sudo chmod 700 /etc/precast-erp /var/backups/precast-erp
```

7. Criar o arquivo externo:

```bash
sudo nano /etc/precast-erp/precast-backup.env
```

Conteudo minimo:

```env
BACKUP_STORAGE_MODE="local"
BACKUP_DATABASE_URL="postgresql://USUARIO:SENHA@HOST:5432/postgres"
BACKUP_LOCAL_DIR="/var/backups/precast-erp"
RESTORE_DATABASE_URL="postgresql://USUARIO:SENHA@HOST:5432/precast_erp_restore_drill"
BACKUP_OPERATOR="Administrador ERP"
```

## Validacao antes do primeiro backup

```bash
npm run backup:check-config -- --env-file /etc/precast-erp/precast-backup.env --skip-tools
```

Para validar tambem as ferramentas instaladas:

```bash
npm run backup:check-config -- --env-file /etc/precast-erp/precast-backup.env
```

Se falhar, nao agendar backup ainda.

## Primeiro backup manual

```bash
npm run backup:full:local -- --env-file /etc/precast-erp/precast-backup.env
npm run backup:check-evidence
```

O backup completo deve gerar:

- dump `.dump` em `/var/backups/precast-erp/full/...`;
- checksum `.sha256`;
- evidencia segura em `docs/security/backups/latest.json`.

## Restore drill

O teste de restauracao continua necessario.

Ele deve restaurar o dump em um banco temporario, nunca no banco real.

Depois de um `backup:full:local`, o restore local pode usar automaticamente a
ultima evidencia de backup:

```bash
npm run backup:restore-drill:local -- --env-file /etc/precast-erp/precast-backup.env
npm run backup:check-restore-drill
```

Tambem e possivel informar os arquivos manualmente:

```bash
npm run backup:restore-drill:local -- --env-file /etc/precast-erp/precast-backup.env --dump-path /var/backups/precast-erp/full/AAAA/MM/DD/arquivo.dump --checksum-path /var/backups/precast-erp/full/AAAA/MM/DD/arquivo.dump.sha256
```

A evidencia aceita caminho `s3://` ou caminho local absoluto.

## Agendamento simples no CT

Exemplo de cron diario as 22h:

```bash
crontab -e
```

Adicionar:

```cron
0 22 * * * cd /caminho/erp-pre-moldados-prototype && npm run backup:full:local -- --env-file /etc/precast-erp/precast-backup.env >> /var/log/precast-backup.log 2>&1
```

## Rotina operacional

Diario:

```bash
npm run backup:check-evidence
```

Semanal:

```bash
npm run backup:readiness -- --env-file /etc/precast-erp/precast-backup.env
```

Mensal:

- escolher um dump recente;
- restaurar em banco temporario com `backup:restore-drill:local`;
- validar que as tabelas principais aparecem;
- registrar evidencia de restore drill.

## Futuro com S3

Se a empresa contratar AWS S3 ou storage compativel, o modo `s3` continua disponivel.

Nesse caso voltam a ser exigidos:

- bucket privado;
- versionamento;
- criptografia;
- bloqueio de acesso publico;
- IAM sem permissao de apagar objetos;
- `npm run backup:check-s3`.

## Criterio de aceite

Backup fica operacional quando:

- `backup:check-config` passar;
- `backup:full:local` gerar dump e checksum;
- `backup:check-evidence` passar;
- a pasta de backup local estiver sendo copiada pelo backup em nuvem da empresa.

Backup/DR completo fica aprovado somente depois do restore drill mensal passar.
