# Evidencias de backup completo

Esta pasta guarda somente evidencias seguras dos backups completos.

Nao registre senhas, tokens, connection strings completas, URLs com usuario/senha ou dados sensiveis.

O arquivo real esperado pelo check e:

`docs/security/backups/latest.json`

No modo local, o comando recomendado e:

```powershell
npm run backup:full:local -- --env-file "C:\seguro\precast-backup.env"
```

No Proxmox CT/Linux, use:

```bash
npm run backup:full:local -- --env-file /etc/precast-erp/precast-backup.env
```

Exemplo seguro de evidencia local:

```json
{
  "schemaVersion": 1,
  "performedAt": "2026-07-08T14:00:00.000Z",
  "operator": "Administrador ERP",
  "type": "full-logical-backup",
  "storageMode": "local",
  "destination": "/var/backups/precast-erp/full/2026/07/08/precast-erp-full.dump",
  "checksumUri": "/var/backups/precast-erp/full/2026/07/08/precast-erp-full.dump.sha256",
  "checksumSha256": "64-caracteres-hexadecimais",
  "sizeBytes": 123456,
  "encryption": "local-managed",
  "result": "PASS"
}
```

Validacao:

```powershell
npm run backup:check-evidence
```

Relatorio consolidado:

```powershell
npm run backup:readiness -- --env-file "C:\seguro\precast-backup.env"
```
