# Evidencias de backup completo

Esta pasta guarda somente evidencias seguras dos backups completos enviados para storage externo.

Nao registre senhas, tokens, connection strings completas, URLs com usuario/senha ou dados sensiveis.

O arquivo real esperado pelo check e:

`docs/security/backups/latest.json`

O script `npm run backup:full` grava esse arquivo automaticamente depois que o dump e o checksum sao enviados para o S3.

Exemplo seguro:

```json
{
  "schemaVersion": 1,
  "performedAt": "2026-06-18T20:00:00.000Z",
  "operator": "Administrador ERP",
  "type": "full-logical-backup",
  "destination": "s3://precast-backups/precast-erp/postgres/full/2026/06/18/precast-erp-full-20260618T200000Z.dump",
  "checksumUri": "s3://precast-backups/precast-erp/postgres/full/2026/06/18/precast-erp-full-20260618T200000Z.sha256",
  "checksumSha256": "64-caracteres-hexadecimais",
  "sizeBytes": 123456,
  "encryption": "AES256",
  "result": "PASS"
}
```

Validacao:

```powershell
npm run backup:check-evidence
```

Relatorio consolidado:

```powershell
npm run backup:readiness
```
