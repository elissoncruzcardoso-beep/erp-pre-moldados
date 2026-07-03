# Runbook de Backup e Disaster Recovery

Este runbook define como operar backup externo e teste de restauracao do PRECAST ERP sem salvar segredos no repositorio.

## Estado atual

O codigo ja possui scripts para:

- validar configuracao externa de backup;
- gerar backup completo PostgreSQL com `pg_dump`;
- enviar dump e checksum para S3;
- gerar export incremental logico;
- validar postura segura do bucket S3;
- executar restore drill em banco temporario;
- registrar evidencias seguras em `docs/security`.

O ambiente so deve ser considerado pronto quando `npm run backup:readiness -- --env-file "C:\seguro\precast-backup.env"` retornar `PRONTO`.

## Arquivos que nunca entram no Git

Nao commitar:

- `C:\seguro\precast-backup.env`;
- dumps `.dump`;
- checksums reais baixados localmente;
- connection strings completas;
- tokens, senhas ou chaves AWS;
- logs com variaveis de ambiente.

O template publico fica em:

`docs/security/backups/precast-backup.env.template`

## Preparacao inicial no servidor/agendador

1. Instalar PostgreSQL Client Tools com `pg_dump`, `pg_restore` e `psql`.
2. Instalar AWS CLI.
3. Criar bucket S3 privado para backup.
4. Habilitar bloqueio de acesso publico, criptografia e versionamento no bucket.
5. Criar usuario IAM exclusivo para backup, sem permissao de apagar objetos.
6. Criar banco temporario para restore drill.
7. Criar o arquivo externo:

```powershell
npm run backup:init-env -- -Apply
```

8. Editar `C:\seguro\precast-backup.env` somente no servidor/agendador.

## Validacao antes de agendar

Rodar:

```powershell
npm run backup:check-config -- --env-file "C:\seguro\precast-backup.env"
npm run backup:check-s3 -- --env-file "C:\seguro\precast-backup.env"
```

Se qualquer comando falhar, nao agendar backup ainda.

## Primeiro backup manual

```powershell
npm run backup:full -- -EnvFile "C:\seguro\precast-backup.env"
npm run backup:check-evidence
```

O backup completo deve gerar `docs/security/backups/latest.json` com caminho S3, checksum, tamanho, criptografia e resultado `PASS`.

## Primeiro restore drill

Use o dump mais recente enviado ao S3:

```powershell
npm run backup:restore-drill -- -EnvFile "C:\seguro\precast-backup.env" -S3DumpUri "s3://bucket/prefix/full/AAAA/MM/DD/arquivo.dump" -S3ChecksumUri "s3://bucket/prefix/full/AAAA/MM/DD/arquivo.sha256"
npm run backup:check-restore-drill
```

O destino precisa ser banco temporario. Nunca aponte `RESTORE_DATABASE_URL` para producao.

## Agendamento Windows

Primeiro simule:

```powershell
npm run backup:install-windows-tasks
```

Depois aplique conscientemente no servidor:

```powershell
npm run backup:install-windows-tasks -- -ProjectPath "C:\caminho\erp-pre-moldados-prototype" -EnvFile "C:\seguro\precast-backup.env" -Apply
```

Tarefas esperadas:

- backup completo diario;
- export incremental horario;
- checagem diaria de configuracao;
- checagem diaria de evidencia de backup;
- checagem diaria de postura S3;
- checagem semanal de restore drill.

## Rotina operacional

Diario:

```powershell
npm run backup:readiness -- --env-file "C:\seguro\precast-backup.env"
```

Mensal:

```powershell
npm run backup:restore-drill -- -EnvFile "C:\seguro\precast-backup.env" -S3DumpUri "s3://bucket/prefix/full/AAAA/MM/DD/arquivo.dump" -S3ChecksumUri "s3://bucket/prefix/full/AAAA/MM/DD/arquivo.sha256"
```

Antes de mudanca grande de schema:

```powershell
npm run backup:full -- -EnvFile "C:\seguro\precast-backup.env"
npm run backup:restore-drill -- -EnvFile "C:\seguro\precast-backup.env" -S3DumpUri "s3://bucket/prefix/full/AAAA/MM/DD/arquivo.dump" -S3ChecksumUri "s3://bucket/prefix/full/AAAA/MM/DD/arquivo.sha256"
```

## Criterio de aceite

Backup/DR fica aprovado somente com:

- `backup:check-config` OK;
- `backup:check-s3` OK ou com avisos aceitos formalmente;
- `backup:check-evidence` OK;
- `backup:check-restore-drill` OK;
- `backup:readiness` com status `PRONTO`.

Enquanto isso nao acontecer, a situacao correta e `BLOQUEADO` por falta de credenciais/evidencias externas.
