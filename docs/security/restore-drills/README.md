# Evidencias de restore drill

Esta pasta guarda somente evidencias seguras dos testes de restauracao.

Nao registre senhas, tokens, connection strings completas, URLs com usuario/senha ou dados sensiveis.

O arquivo real esperado pelo check e:

`docs/security/restore-drills/latest.json`

Esse arquivo deve ser criado depois de um restore testado com sucesso em banco temporario.

O script `npm run backup:restore-drill` grava esse arquivo automaticamente quando for executado com `-S3DumpUri` ou com `RESTORE_DRILL_SOURCE_BACKUP_URI` apontando para `s3://...`.

Exemplo seguro:

```json
{
  "schemaVersion": 1,
  "performedAt": "2026-06-17T20:00:00.000Z",
  "operator": "Administrador ERP",
  "sourceBackup": "s3://precast-backups/precast-erp/postgres/full/2026/06/17/precast-erp-full.dump",
  "restoreTarget": "precast_erp_restore_drill",
  "checksumVerified": true,
  "userTableVerified": true,
  "publicTableCount": 42,
  "result": "PASS",
  "notes": "Restore validado em banco temporario."
}
```

Validacao:

```powershell
npm run backup:check-restore-drill
```

Relatorio consolidado:

```powershell
npm run backup:readiness
```
