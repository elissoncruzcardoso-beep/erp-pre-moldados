# Auditoria geral do ERP - 2026-06-27

## Escopo

Auditoria do projeto Next.js/React/PostgreSQL/Prisma do ERP Pre-Moldados, cobrindo:

- estado do repositorio;
- build, testes e scripts;
- autenticacao, autorizacao e permissoes;
- APIs e protecao contra escrita indevida;
- Prisma, Supabase e RLS;
- backup, disaster recovery e deploy;
- fluxos principais de estoque, producao, vendas, financeiro, suprimentos e cadastros;
- UI, performance e manutencao.

## Resumo executivo

O sistema esta bem mais maduro do que um prototipo. Existem boas bases de seguranca: sessoes HTTP-only, guards de API, guards de pagina, CSRF/origin no middleware, rate limit simples, RLS fechado no Supabase, auditoria em APIs mutaveis, logs com requestId, healthcheck e testes automatizados.

Nao encontrei exposicao direta de service role key no frontend, nem SQL raw bloqueado, nem grants publicos ativos no Supabase.

Pontos que impedem chamar o sistema de pronto para producao:

1. Backup/DR ainda nao esta configurado.
2. Build/typecheck/lint local nao estao limpos.
3. Existem alteracoes pendentes no worktree.
4. Alguns resumos financeiros ainda podem divergir por regra de agregacao.
5. Alguns componentes ainda usam `fetch` direto, fora do helper padronizado.

## Achados por severidade

### Alta - Backup e disaster recovery bloqueados

Evidencia:

- `npm.cmd run backup:readiness`
- Status: `BLOQUEADO`
- Variaveis ausentes: `BACKUP_DATABASE_URL`, `BACKUP_S3_BUCKET`, `BACKUP_S3_PREFIX`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
- Restore drill ainda pendente.

Impacto:

Sem backup externo e restore testado, uma exclusao acidental, falha no banco ou incidente no Supabase pode gerar perda operacional real.

Correcao recomendada:

- Criar arquivo de backup fora do repositorio.
- Configurar bucket S3 privado, versionado, com bloqueio de acesso publico e TLS obrigatorio.
- Rodar:

```powershell
npm.cmd run backup:check-config
npm.cmd run backup:check-s3
npm.cmd run backup:full
npm.cmd run backup:check-evidence
npm.cmd run backup:restore-drill
```

### Alta - Build local nao fecha por ambiente/TypeScript

Evidencia:

- `npm.cmd run build` falhou no `prisma generate`:
  - `EPERM: operation not permitted, rename ... query_engine-windows.dll.node`
- `npx.cmd next build` compilou o app, mas falhou na fase TypeScript:
  - `Error: spawn EPERM`
- `npx.cmd tsc --noEmit --pretty false` falhou em testes de backup/Supabase por mocks desatualizados.
- `npm.cmd run lint` falhou porque `next lint` nao e mais valido nesta versao do Next.

Impacto:

Pode bloquear CI/CD, Vercel e revisoes futuras. Tambem dificulta saber se um erro veio do codigo ou do ambiente Windows.

Correcao recomendada:

- Ajustar os mocks dos testes:
  - `tests/backup-readiness-report.test.ts`
  - `tests/backup-s3-posture.test.ts`
  - `tests/health-url-monitor.test.ts`
  - `tests/supabase-live-rls.test.ts`
- Trocar script de lint para comando ESLint valido.
- Rodar build em ambiente limpo, sem dev server segurando DLL do Prisma.

### Alta - Token de Telegram deve ser rotacionado

Evidencia:

- O token do bot foi compartilhado anteriormente durante a configuracao.
- O codigo nao deve exibir esse token, mas token compartilhado deve ser tratado como exposto.

Impacto:

Alguem com o token pode interagir com o bot ou tentar configurar webhook indevido.

Correcao recomendada:

- Rotacionar o token no BotFather.
- Atualizar `TELEGRAM_BOT_TOKEN` no Vercel e no `.env` local.
- Reconfigurar webhook depois da troca.

### Media - Worktree com muitas alteracoes pendentes

Evidencia:

`git status --short` mostra alteracoes em documentos e arquivos de codigo, incluindo:

- `src/app/produtos/page.tsx`
- `src/app/produtos/composition-actions.tsx`
- `src/app/produtos/composition-form.tsx`
- `src/app/suprimentos/purchase-request-actions.tsx`
- `src/components/pagination-controls.tsx`
- `src/lib/pagination.ts`
- `src/app/globals.css`
- varios `.md`

Impacto:

Fica dificil auditar, testar e publicar sem saber exatamente qual pacote de mudancas esta indo junto.

Correcao recomendada:

- Separar em commits pequenos:
  1. UI produtos/composicoes.
  2. Modal solicitacoes.
  3. Paginacao.
  4. Documentacao.
- Rodar testes antes do push.

### Media - Financeiro pode exibir valor aberto maior que o saldo real

Evidencia:

- `src/app/dashboard/page.tsx` calcula aberto como `amount - receivedAmount`.
- `src/app/financeiro/page.tsx` soma `amount` em contas abertas/faturadas.

Impacto:

Um titulo parcialmente recebido pode aparecer no resumo financeiro com o valor total, nao com o saldo restante.

Correcao recomendada:

- Em `src/app/financeiro/page.tsx`, calcular:
  - `a receber aberto = sum(amount) - sum(receivedAmount)`;
  - `a pagar aberto = sum(amount) - sum(paidAmount)`.
- Reaproveitar helper compartilhado para dashboard e financeiro.

### Media - Estoque filtra saldos depois de carregar ate 500 registros

Evidencia:

- `src/app/estoque/page.tsx` carrega `STOCK_BALANCE_LIMIT = 500`.
- Depois consolida, filtra e pagina em memoria.

Impacto:

Quando houver mais de 500 saldos/lotes, filtros e paginas podem omitir registros.

Correcao recomendada:

- Criar consulta server-side para saldo consolidado por item/deposito.
- Aplicar filtro e paginacao no banco, nao depois do limite fixo.
- Manter excecoes transacionais apenas para consumo de estoque.

### Media - Alguns formularios ainda usam fetch direto

Evidencia:

Arquivos com `fetch` direto:

- `src/app/usuarios/user-form.tsx`
- `src/app/usuarios/user-actions.tsx`
- `src/app/usuarios/role-management.tsx`
- `src/app/cadastros/_components/base-register-form.tsx`
- `src/app/cadastros/_components/base-crud-actions.tsx`
- `src/app/login/login-form.tsx`
- `src/app/setup-admin/setup-admin-form.tsx`
- `src/app/cadastros/produtos/product-curing-form.tsx`
- `src/app/estoque/venda-direta/direct-sale-actions.tsx`

Impacto:

Erro, loading e mensagem ao usuario podem ficar inconsistentes entre telas.

Correcao recomendada:

- Migrar gradualmente para `fetchJson` e/ou `useApiForm`.
- Manter excecoes conscientes para login/logout/setup se fizer sentido.

### Media - Rate limit em memoria nao e distribuido

Evidencia:

- `middleware.ts` usa `globalThis.apiRateLimits`.
- `src/lib/auth/rate-limit.ts` tambem usa memoria local.

Impacto:

Em Vercel/serverless, limites podem resetar por instancia ou deploy. Serve como protecao basica, mas nao como defesa forte.

Correcao recomendada:

- Para producao, mover rate limit para Redis/Upstash, banco ou servico gerenciado.
- Aplicar especialmente em login e APIs mutaveis sensiveis.

### Baixa - Lint script obsoleto

Evidencia:

- `npm.cmd run lint`
- Erro: `Invalid project directory provided... \lint`

Impacto:

Nao bloqueia runtime, mas tira uma camada de qualidade do CI.

Correcao recomendada:

- Substituir script por algo compativel com ESLint atual, por exemplo:

```json
"lint": "eslint ."
```

## Pontos positivos confirmados

- `npm.cmd test`: 132 testes passaram.
- `npm.cmd audit --omit=dev`: 0 vulnerabilidades.
- `npm.cmd run security:check-env`: OK.
- `npm.cmd run security:check-sql`: OK.
- `npm.cmd run security:check-public-exposure`: OK.
- `npm.cmd run security:check-supabase-rls`: OK.
- `npm.cmd run security:check-api-errors`: OK.
- `npm.cmd run security:check-api-auth`: OK.
- `npm.cmd run security:check-api-audit`: OK.
- `npm.cmd run security:check-api-observability`: OK.
- `npm.cmd run security:check-health`: OK.
- `npm.cmd run security:check-migrations`: OK, com aviso de `SHADOW_DATABASE_URL` ausente.
- `npm.cmd run security:audit-supabase-live`: OK, 39 tabelas publicas com RLS e sem grants/policies expostas.
- Middleware protege mutacoes de API por origem/CSRF e aplica requestId.
- Headers de seguranca configurados em `next.config.ts`.
- Rotas destrutivas de limpeza exigem permissao `manutencao.cleanup`, perfil Administrador e header de confirmacao.
- Fluxos sensiveis de estoque/venda usam transacao serializavel e decremento atomico.

## Proxima ordem recomendada

1. Corrigir typecheck dos testes e script de lint.
2. Resolver build local em ambiente limpo, sem DLL Prisma travada.
3. Configurar backup externo e restore drill.
4. Corrigir resumo financeiro para usar saldo em aberto real.
5. Refatorar filtros de saldo de estoque para server-side.
6. Padronizar `fetch` direto restante.
7. Rotacionar token do Telegram.
8. Separar e commitar o worktree em pacotes pequenos.
