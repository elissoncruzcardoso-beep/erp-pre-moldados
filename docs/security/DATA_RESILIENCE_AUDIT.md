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

## Variaveis de ambiente

Configure no ambiente que vai rodar os backups, nao no frontend:

```env
BACKUP_DATABASE_URL="postgresql://postgres:senha@db.PROJECT_REF.supabase.co:5432/postgres"
BACKUP_S3_BUCKET="nome-do-bucket-privado"
BACKUP_S3_PREFIX="precast-erp/postgres"
AWS_REGION="sa-east-1"
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."
BACKUP_S3_KMS_KEY_ID="opcional"
```

Nunca use prefixo `NEXT_PUBLIC_` nessas variaveis.

## Agendamento recomendado no Windows

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
pg_restore --dbname "postgresql://usuario:senha@host:5432/postgres" --clean --if-exists --no-owner --no-privileges .\precast-erp-full-YYYYMMDDTHHMMSSZ.dump
```

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
4. Rodar backup completo manual uma vez.
5. Testar restauracao em banco temporario.
6. Depois automatizar agendamento.

