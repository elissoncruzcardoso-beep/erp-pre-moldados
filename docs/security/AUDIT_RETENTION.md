# Retencao de auditoria

O ERP guarda eventos operacionais em `AuditLog`.

Para evitar crescimento infinito do banco, existe limpeza controlada de logs antigos.

Padrao:

- Retencao: 730 dias.
- Minimo permitido: 180 dias.
- Lote padrao: 1000 registros por execucao.
- Maximo por lote: 5000 registros.
- Eventos `PERMISSION_CHANGE` sao preservados.

## Previa segura

Este comando nao apaga nada:

```powershell
npm run maintenance:audit-retention
```

Com parametros:

```powershell
npm run maintenance:audit-retention -- --retention-days 730 --batch-size 1000
```

## Execucao real

Use somente depois de conferir a previa:

```powershell
npm run maintenance:audit-retention -- --execute --confirm LIMPAR_AUDITORIA
```

Cada execucao real cria um novo `AuditLog` informando corte, quantidade elegivel, quantidade apagada e operador.

## API interna

Endpoint:

`POST /api/auditoria/retencao`

Regras:

- exige sessao;
- exige permissao `manutencao.cleanup`;
- exige perfil `Administrador`;
- em `dryRun: false`, exige header `x-cleanup-confirmation: LIMPAR_AUDITORIA`.

Exemplo de payload:

```json
{
  "retentionDays": 730,
  "batchSize": 1000,
  "dryRun": true
}
```
