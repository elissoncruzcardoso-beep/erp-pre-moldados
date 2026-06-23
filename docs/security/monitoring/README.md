# Evidencias de monitoramento

Esta pasta guarda evidencias operacionais do healthcheck do ERP.

Gerar evidencia do site publicado:

```powershell
npm run monitoring:check-health -- --url https://seu-site.vercel.app --write-evidence docs/security/monitoring/health-latest.json
```

Validar evidencia recente:

```powershell
npm run monitoring:check-health-evidence
```

O arquivo `health-latest.json` deve conter apenas estado operacional. Nao inclua token, senha, chave, URL de banco ou segredo.
