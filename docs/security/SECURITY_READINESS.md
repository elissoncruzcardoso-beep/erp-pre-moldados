# Relatorio consolidado de seguranca e producao

Use este relatorio antes de publicar uma versao importante, liberar acesso para novos usuarios ou revisar o ERP com a diretoria.

```powershell
npm run security:readiness
```

Para saida JSON:

```powershell
npm run security:readiness -- --json
```

Para usar como trava operacional:

```powershell
npm run security:readiness -- --strict
```

## O que ele consolida

- ambiente e segredos obrigatorios;
- bloqueio de SQL raw;
- limites de consultas;
- exposicao publica de segredos ou Supabase;
- hardening Supabase RLS;
- erros de API sem vazamento tecnico;
- autenticacao obrigatoria em rotas mutaveis;
- auditoria em rotas mutaveis;
- observabilidade de APIs mutaveis;
- healthcheck seguro em `/api/health`;
- migrations Prisma versionadas;
- backup e Disaster Recovery.

## Healthcheck

O endpoint `/api/health` pode ser usado por Vercel, monitoramento externo ou rotina interna para verificar se o app responde e se o banco aceita uma consulta minima.

Ele retorna apenas estado geral (`ok` ou `degraded`) e nao expõe mensagem de erro, stack trace, URL do banco ou segredo.

Verificacao isolada:

```powershell
npm run security:check-health
```

Checagem operacional contra o site publicado:

```powershell
npm run monitoring:check-health -- --url https://seu-site.vercel.app
```

Para gerar uma evidencia local do ultimo healthcheck aprovado:

```powershell
npm run monitoring:check-health -- --url https://seu-site.vercel.app --write-evidence docs/security/monitoring/health-latest.json
```

Para validar se a evidencia ainda esta recente:

```powershell
npm run monitoring:check-health-evidence
```

Tambem pode usar variavel de ambiente:

```powershell
$env:HEALTHCHECK_URL="https://seu-site.vercel.app"
npm run monitoring:check-health
```

Agendamento no Windows, em modo seguro:

```powershell
npm run monitoring:install-windows-health -- -HealthcheckUrl "https://seu-site.vercel.app"
```

Esse comando roda em dry-run e nao registra tarefa. Para registrar a checagem a cada 5 minutos:

```powershell
npm run monitoring:install-windows-health -- -HealthcheckUrl "https://seu-site.vercel.app" -Apply
```

Tambem e possivel configurar o intervalo:

```powershell
npm run monitoring:install-windows-health -- -HealthcheckUrl "https://seu-site.vercel.app" -IntervalMinutes 10 -Apply
```

O instalador bloqueia URL sem `http://` ou `https://` e recusa query string com `token`, `key`, `secret`, `password` ou `senha`.

Recomendacao de producao:

- configurar um monitor externo para chamar `/api/health` a cada 5 minutos;
- gerar alerta quando o HTTP for diferente de `200`;
- gerar alerta quando `ok` nao for `true`;
- gerar alerta quando `checks.database` nao for `ok`;
- nao colocar token, senha ou chave na URL do monitor;
- manter a evidencia local em `docs/security/monitoring/health-latest.json` quando quiser comprovar o ultimo teste operacional.

## Rastreabilidade de requisicoes

Toda resposta de API inclui o header `x-request-id`.

Uso pratico:

- quando um usuario reportar erro, pedir horario aproximado e, se possivel, o `x-request-id`;
- usar esse codigo para comparar logs do Vercel, banco e auditoria;
- se um cliente externo enviar um `x-request-id` valido, o ERP preserva o valor;
- valores suspeitos ou com caracteres perigosos sao descartados e substituidos por um novo ID.

Os fluxos criticos registram logs internos em JSON com:

- `requestId`;
- `module`;
- `action`;
- `userId`, quando existe sessao;
- `entity`, quando o fluxo afeta um registro principal;
- nome tecnico do erro, sem stack trace e sem mensagem interna sensivel.

Primeiros fluxos cobertos:

- login;
- estoque;
- venda direta;
- contas a receber;
- contas a pagar;
- recebimentos;
- pagamentos;
- bot Telegram.

Auditoria de cobertura operacional:

```powershell
npm run security:check-api-observability
```

Essa checagem procura rotas mutaveis que ainda nao usam `handleApiError` com `context` ou outro log operacional. Ela deve ser usada para guiar a correcao por modulo antes de virar trava do build.

Ela tambem roda no `prebuild`, junto dos demais guardrails antes do `next build`.

## Status

- `PRONTO`: checks criticos e backup/DR estao aprovados.
- `PARCIAL`: checks de seguranca passaram, mas existem avisos ou evidencias operacionais pendentes.
- `BLOQUEADO`: existe falha critica, segredo fraco, exposicao, RLS incompleto, API insegura, migration insegura ou backup/DR bloqueado.

## Observacao importante

Este relatorio nao substitui o teste real de restauracao. Para fechar a meta de backup/DR, rode tambem:

```powershell
npm run backup:readiness
```

E mantenha evidencias recentes em:

- `docs/security/backups/latest.json`
- `docs/security/backups/s3-posture-latest.json`
- `docs/security/restore-drills/latest.json`
- `docs/security/monitoring/health-latest.json`
