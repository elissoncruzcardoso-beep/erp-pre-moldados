# Auditoria de Resiliencia de Dados - PRECAST ERP

Data: 31/05/2026

## Diagnostico

### 1. Rotinas automatizadas de backup

Nao havia rotina de backup automatizada no projeto.

Foi encontrado apenas um cron operacional no Vercel:

- `/api/cron/auto-liberar-cura`
- Objetivo: liberar lotes em cura.
- Nao e rotina de backup.

Risco: se houver erro humano, corrupcao de dados, exclusao acidental ou invasao, o ERP depende apenas dos backups gerenciados do Supabase e nao tem copia propria externa.

### 2. Isolamento dos backups

Nao havia estrategia documentada de storage externo.

Risco: backup salvo na mesma maquina, no mesmo repositorio, no mesmo servidor da aplicacao ou no mesmo provedor principal nao protege contra invasao, exclusao do projeto ou comprometimento de credenciais.

Recomendacao: enviar backups para storage externo com:

- Bucket privado;
- Versionamento ativo;
- Criptografia SSE-S3 ou SSE-KMS;
- Politica de imutabilidade/retencao quando possivel;
- Usuario IAM exclusivo para backup, sem permissao de apagar objetos;
- Retencao separada por frequencia.

### 3. Disaster Recovery

Nao havia plano de DR formal.

Recomendacao inicial:

| Item | Meta recomendada |
| --- | --- |
| RPO operacional | Ate 1 hora com export incremental |
| RPO real de banco | PITR do Supabase, se contratado |
| RTO inicial | 4 a 8 horas |
| Backup completo | Diario |
| Export incremental | A cada 1 hora |
| Teste de restauracao | Mensal |
| Retencao diaria | 30 dias |
| Retencao mensal | 12 meses |

## Estrategia recomendada

### Camada 1: Supabase Managed Backups

Manter backups nativos do Supabase habilitados.

Segundo a documentacao oficial, projetos Supabase possuem backups diarios conforme o plano. Para menor perda de dados, a recomendacao oficial e habilitar Point-in-Time Recovery (PITR), que usa WAL para restaurar para um ponto especifico no tempo.

Observacao: backup nativo do Supabase nao substitui copia externa propria, pois a restauracao e operacionalmente dependente do provedor e do projeto.

### Camada 2: Backup completo externo

Script criado:

`scripts/backup/backup-full-postgres.ps1`

Funcoes:

- Usa `pg_dump` em formato custom;
- Gera checksum SHA256;
- Envia para AWS S3;
- Usa criptografia no upload;
- Remove copia local temporaria por padrao.

Frequencia recomendada: diaria, fora do horario comercial.

### Camada 3: Export incremental externo

Script criado:

`scripts/backup/export-incremental.mjs`

Funcoes:

- Exporta linhas alteradas desde o ultimo watermark;
- Usa colunas `updatedAt` quando existem;
- Usa `createdAt` como fallback;
- Salva estado do watermark no S3;
- Envia arquivo JSONL compactado com gzip para S3;
- Remove copia local temporaria por padrao.

Frequencia recomendada: a cada 1 hora.

Limitacao importante: este export incremental nao e PITR/WAL. Ele ajuda a recuperar dados recentes e auditar alteracoes, mas nao reconstrui transacoes com a mesma fidelidade de WAL. Para recuperacao precisa em segundos/minutos, usar Supabase PITR.

### Camada 4: Teste de restauracao

Script criado:

`scripts/backup/restore-drill.ps1`

Funcoes:

- Restaura um dump completo em banco temporario;
- Valida checksum SHA256 antes da restauracao;
- Bloqueia uso acidental do banco real comparando com `DATABASE_URL`, `DIRECT_URL` e `BACKUP_DATABASE_URL`;
- Exige que o banco de destino pareca ambiente de teste (`restore`, `drill`, `teste`, `test`, `tmp`, `temp` ou `ci` no nome), salvo liberacao consciente por variavel;
- Confere se as tabelas public foram restauradas e se a tabela `User` existe.

Frequencia recomendada: mensal e sempre antes de mudancas grandes de schema.

## Variaveis de ambiente

Configure no ambiente que vai rodar os backups, nao no frontend:

```env
BACKUP_DATABASE_URL="postgresql://postgres:senha@db.PROJECT_REF.supabase.co:5432/postgres"
BACKUP_S3_BUCKET="nome-do-bucket-privado"
BACKUP_S3_PREFIX="precast-erp/postgres"
RESTORE_DATABASE_URL="postgresql://usuario:senha@host:5432/precast_erp_restore"
AWS_REGION="sa-east-1"
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."
BACKUP_S3_KMS_KEY_ID="opcional"
```

Nunca use prefixo `NEXT_PUBLIC_` nessas variaveis.

Use o template seguro como base:

`docs/security/backups/precast-backup.env.template`

Copie para um local fora do repositorio, por exemplo:

`C:\seguro\precast-backup.env`

No Windows, o projeto tem um inicializador em modo seguro. Por padrao ele so mostra o plano:

```powershell
npm run backup:init-env
```

Para criar o arquivo externo a partir do template:

```powershell
npm run backup:init-env -- -Apply
```

O script bloqueia destino dentro do repositorio e nao sobrescreve arquivo existente sem `-Force`.

Opcionalmente defina uma variavel de ponteiro no servidor/agendador:

```powershell
$env:PRECAST_BACKUP_ENV_FILE="C:\seguro\precast-backup.env"
```

Quando `PRECAST_BACKUP_ENV_FILE` estiver definida, os comandos de backup usam esse arquivo automaticamente. Tambem e possivel informar manualmente com `--env-file`.

Antes de rodar backup ou restore, valide a configuracao sem expor segredos:

```powershell
npm run backup:check-config -- --env-file "C:\seguro\precast-backup.env"
```

O comando confere variaveis obrigatorias, formato do bucket/prefixo S3, ausencia de variaveis publicas sensiveis, banco de restore isolado e ferramentas locais (`aws`, `pg_dump`, `pg_restore`, `psql`).

Depois de criar o bucket S3 e configurar as credenciais no servidor/agendador, valide a postura de seguranca do bucket:

```powershell
npm run backup:check-s3 -- --env-file "C:\seguro\precast-backup.env"
```

Esse comando confere bloqueio publico, criptografia padrao, versionamento e bucket policy exigindo TLS. Lifecycle e Object Lock sao reportados como avisos quando ausentes.

Para gravar evidencia operacional segura da postura S3:

```powershell
npm run backup:check-s3 -- --env-file "C:\seguro\precast-backup.env" --write-evidence "docs/security/backups/s3-posture-latest.json"
```

Valide a evidencia:

```powershell
npm run backup:check-s3-evidence
```

Templates de apoio:

- `docs/security/backups/aws/iam-backup-writer-policy.json`
- `docs/security/backups/aws/bucket-deny-insecure-transport-policy.json`
- `docs/security/backups/aws/README.md`

Depois de executar um restore drill real, registre uma evidencia segura em:

`docs/security/restore-drills/latest.json`

Depois de executar um backup completo real, o script grava uma evidencia segura em:

`docs/security/backups/latest.json`

Valide a evidencia do backup:

```powershell
npm run backup:check-evidence
```

Valide a evidencia:

```powershell
npm run backup:check-restore-drill
```

Esse check falha se a evidencia estiver ausente, vencida, incompleta ou se contiver senha/token/connection string completa. O objetivo e provar que o restore foi testado sem expor segredos no repositorio.

Relatorio consolidado de prontidao:

```powershell
npm run backup:readiness -- --env-file "C:\seguro\precast-backup.env"
```

O relatorio retorna `PRONTO`, `PARCIAL` ou `BLOQUEADO`.

- `PRONTO`: configuracao externa valida e restore drill recente aprovado.
- `PARCIAL`: configuracao pronta, mas restore drill ausente, vencido ou incompleto.
- `BLOQUEADO`: falta configuracao critica de backup externo ou existe risco de segredo exposto.

Para usar como trava operacional:

```powershell
npm run backup:readiness -- --strict
```

O modo estrito falha quando o ambiente nao esta `PRONTO`.

## Agendamento recomendado no Windows

O projeto possui um instalador de tarefas agendadas para Windows. Por padrao ele roda em modo dry-run e nao altera o sistema:

```powershell
npm run backup:install-windows-tasks
```

Para registrar as tarefas no servidor/agendador, execute conscientemente com `-Apply`:

```powershell
npm run backup:install-windows-tasks -- -ProjectPath "C:\caminho\erp-pre-moldados-prototype" -EnvFile "C:\seguro\precast-backup.env" -Apply
```

Tarefas criadas:

- Backup completo diario;
- Export incremental horario;
- Verificacao diaria de configuracao;
- Verificacao diaria de postura S3;
- Verificacao semanal de evidencia de restore drill.

Backup completo diario:

```powershell
powershell.exe -ExecutionPolicy Bypass -File "C:\caminho\erp-pre-moldados-prototype\scripts\backup\backup-full-postgres.ps1"
```

Export incremental horario:

```powershell
node "C:\caminho\erp-pre-moldados-prototype\scripts\backup\export-incremental.mjs"
```

## Agendamento recomendado no Linux

```cron
0 2 * * * cd /opt/erp-pre-moldados-prototype && pwsh ./scripts/backup/backup-full-postgres.ps1 >> /var/log/precast-backup-full.log 2>&1
0 * * * * cd /opt/erp-pre-moldados-prototype && node ./scripts/backup/export-incremental.mjs >> /var/log/precast-backup-incremental.log 2>&1
```

## Procedimento de restauracao

### Restaurar backup completo

1. Criar banco de destino vazio.
2. Baixar dump e checksum do S3.
3. Validar checksum.
4. Restaurar com `pg_restore`.

Exemplo:

```powershell
aws s3 cp s3://bucket/precast-erp/postgres/full/2026/05/31/precast-erp-full-YYYYMMDDTHHMMSSZ.dump .
aws s3 cp s3://bucket/precast-erp/postgres/full/2026/05/31/precast-erp-full-YYYYMMDDTHHMMSSZ.sha256 .
Get-FileHash -Algorithm SHA256 .\precast-erp-full-YYYYMMDDTHHMMSSZ.dump
pg_restore --dbname $env:RESTORE_DATABASE_URL --clean --if-exists --no-owner --no-privileges .\precast-erp-full-YYYYMMDDTHHMMSSZ.dump
```

Teste mensal recomendado usando o script seguro:

```powershell
npm run backup:restore-drill -- -DumpPath ".\precast-erp-full-YYYYMMDDTHHMMSSZ.dump" -ChecksumPath ".\precast-erp-full-YYYYMMDDTHHMMSSZ.sha256"
```

Ou baixando direto do S3:

```powershell
npm run backup:restore-drill -- -S3DumpUri "s3://bucket/precast-erp/postgres/full/2026/05/31/precast-erp-full-YYYYMMDDTHHMMSSZ.dump" -S3ChecksumUri "s3://bucket/precast-erp/postgres/full/2026/05/31/precast-erp-full-YYYYMMDDTHHMMSSZ.sha256"
```

Quando o restore usa `-S3DumpUri`, o script grava automaticamente a evidencia segura em `docs/security/restore-drills/latest.json`.

Nunca aponte `RESTORE_DATABASE_URL` para o banco de producao.

### Restaurar dados incrementais

1. Restaurar o backup completo mais recente anterior ao incidente.
2. Baixar os arquivos incrementais posteriores.
3. Reprocessar JSONL com script de importacao controlado por tabela.
4. Conferir saldos de estoque, financeiro e auditoria.

Recomendacao: criar script de replay incremental somente depois de validar a politica final de RPO/RTO com a diretoria.

## Controles de seguranca no S3

Politicas recomendadas:

- Bloquear acesso publico;
- Habilitar versionamento;
- Habilitar criptografia padrao;
- Usar bucket policy exigindo TLS;
- IAM de backup com `s3:PutObject`, `s3:GetObject`, `s3:ListBucket`, sem `s3:DeleteObject`;
- Lifecycle: mover backups antigos para Glacier/Deep Archive.

## Proximo passo recomendado

1. Criar bucket S3 privado.
2. Criar usuario IAM exclusivo para backup.
3. Configurar variaveis no servidor/agendador.
4. Rodar `npm run backup:check-config`.
5. Rodar `npm run backup:check-s3`.
6. Rodar backup completo manual uma vez.
7. Testar restauracao em banco temporario.
8. Rodar `npm run backup:readiness`.
9. Depois automatizar agendamento.
