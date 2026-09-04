# Evidencias de backup completo

Esta pasta guarda somente evidencias seguras dos backups completos.

Nao registre senhas, tokens, connection strings completas, URLs com usuario/senha ou dados sensiveis.

O arquivo real esperado pelo check e:

`docs/security/backups/latest.json`

Os arquivos `docs/security/backups/latest.json`,
`docs/security/backups/s3-posture-latest.json` e
`docs/security/restore-drills/latest.json` sao gerados localmente e ficam
ignorados pelo Git. Guarde a evidencia completa no ambiente seguro da empresa.

Por padrao, os scripts procuram o arquivo externo de configuracao em
`C:\seguro\precast-backup.env` no Windows ou
`/etc/precast-erp/precast-backup.env` no Linux/Proxmox CT.

No Proxmox CT, gere o arquivo externo a partir do template:

```bash
npm run backup:init-linux-env -- --backup-env-file /etc/precast-erp/precast-backup.env
sudo node scripts/backup/init-linux-backup-env.mjs --backup-env-file /etc/precast-erp/precast-backup.env --apply
```

Depois edite `/etc/precast-erp/precast-backup.env` e preencha as credenciais
reais antes de validar. O arquivo e criado com permissao `600`, fora do Git.

O template usa `BACKUP_DATABASE_SCHEMA="public"`. Esse limite impede que o
backup do ERP tente copiar schemas internos gerenciados pelo Supabase.

Para o modo local, `BACKUP_RETENTION_DAYS="30"` mantem os backups dos ultimos
30 dias. A limpeza aceita somente `.dump` e `.dump.sha256` dentro da pasta
`full` e ocorre depois da criacao do backup novo.

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

Restore drill local:

```bash
npm run backup:restore-drill:local -- --env-file /etc/precast-erp/precast-backup.env
```

Agendamento no Proxmox CT/Linux:

```bash
npm run backup:install-linux-cron -- --project-path /opt/precast/erp-pre-moldados-prototype --backup-env-file /etc/precast-erp/precast-backup.env --log-dir /var/log/precast-erp
```

O comando acima e dry-run. Para instalar no crontab do CT, revise a saida e rode
novamente com `--apply`.
