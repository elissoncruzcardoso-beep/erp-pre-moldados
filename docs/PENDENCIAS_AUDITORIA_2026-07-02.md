# Pendências de Auditoria — 2026-07-02

> Documento gerado por auditoria externa (Claude) para execução pelo Codex.
> **Contexto:** sistema em produção. Toda mudança deve ser incremental, testada e
> sem quebra de contrato de API ou de regra de negócio existente.
>
> A auditoria confirmou que os itens críticos anteriores **já foram resolvidos e
> verificados** (estoque atômico + Serializable, rate limit no login, correção de
> vazamento de erro, fail-closed no `getSession`, HSTS, CSP endurecida em prod,
> 132 testes passando, CI, 12 guards de segurança no prebuild, migrations, backup
> com restore-drill). Este arquivo lista **somente o que resta**.

---

## Verificação Codex — 2026-07-03

Esta seção registra a conferência local feita pelo Codex em 2026-07-03. Ela não
remove o conteúdo da auditoria externa; apenas marca o que foi comprovado no
estado atual do repositório.

### Evidências coletadas

- `npm test`: passou com 135 testes.
- `npm run build`: passou com `EXIT=0`.
- `npm audit`: 0 vulnerabilidades.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- `git status --short`: ainda existem arquivos modificados e documentos de
  auditoria não commitados.
- `npm run backup:readiness`: status `BLOQUEADO`; variáveis de backup externo
  e restore ainda ausentes no ambiente local.
- `npm run security:readiness`: status `BLOQUEADO` somente por Backup e
  Disaster Recovery. Os demais itens retornaram `OK`.
- `npm run security:check-migrations`: passou, mas no ambiente local ainda
  avisa que `SHADOW_DATABASE_URL` está ausente. O workflow de CI foi ajustado
  com Postgres de serviço e `SHADOW_DATABASE_URL`.
- `src/lib/auth/rate-limit.ts`: rate limit de login foi migrado para
  armazenamento durável via Prisma/Postgres.
- `prisma/migrations/20260703000000_add_login_attempts/`: migration criada para
  a tabela `LoginAttempt`.
- `tests/e2e-direct-sale-flow.test.ts`: teste E2E do fluxo venda → estoque →
  financeiro → cancelamento criado e passando.
- P2.1 validado com `rg "getSession\(\)" src/app/api -n`: nenhuma ocorrência
  fora das rotas públicas de autenticação.
- P2.2 executado parcialmente: logs locais e `DESIGN.md` obsoleto removidos;
  `agent.md`, `Memory.md` e `soul.md` foram movidos para `docs/`.
- P2.3 executado: comentário em `src/lib/auth/rate-limit.ts` e documentação em
  `docs/DEPLOY.md` para proxy/Nginx.

### Situação por item

- P0.1 continua pendente: há alterações locais e arquivos de auditoria sem
  commit.
- P0.2 resolvido no código e coberto por testes automatizados. Falta apenas
  smoke manual de login em servidor reiniciado, se for exigido como aceite
  operacional.
- P1.1 resolvido: `npm audit` e `npm audit --omit=dev` retornaram 0
  vulnerabilidades.
- P1.2 parcialmente resolvido: CI foi configurado com Postgres e
  `SHADOW_DATABASE_URL`; falta confirmar o log verde no GitHub Actions e fazer
  o teste negativo local com Postgres disponível.
- P1.3 resolvido: teste E2E do fluxo crítico criado e passando.
- P2.1 resolvido: APIs mutáveis usam `requireApiSession`.
- P2.2 resolvido na parte de higiene local/documental. `PROCESS.md` permanece
  na raiz por decisão de privacidade e está ignorado no Git.
- P2.3 resolvido: requisito de proxy documentado no código e em `docs/DEPLOY.md`.

### Observação importante

O cabeçalho da auditoria externa afirma que backup com restore-drill já estava
resolvido e verificado. No ambiente local atual, isso não foi comprovado:
`npm run backup:readiness` segue bloqueado. Antes de considerar backup/DR como
pronto, é necessário configurar as variáveis externas e gerar evidências de
backup e restore.

---

## Como usar este documento

- Executar na ordem: P0 → P1 → P2.
- Cada tarefa tem: contexto, arquivos-alvo, implementação sugerida e **critérios
  de aceite**. Não considerar concluída sem os critérios verdes.
- Após cada tarefa: `npm test` + guards do prebuild devem passar.
- Não introduzir dependências novas sem necessidade real (preferir Postgres já
  existente a serviços externos).

---

## 🔴 P0 — Crítico

### P0.1 — Commitar/organizar o trabalho pendente na árvore

**Contexto:** há ~15 arquivos modificados sem commit (`src/app/globals.css`,
`src/app/produtos/page.tsx`, `src/app/produtos/composition-actions.tsx`,
`src/app/produtos/composition-form.tsx`,
`src/app/suprimentos/purchase-request-actions.tsx`,
`src/components/pagination-controls.tsx`, `src/lib/pagination.ts`, docs, etc.)
e `docs/AUDITORIA_GERAL_2026-06-27.md` untracked. Risco de perda de trabalho e
de divergência entre HEAD e o que está em produção.

**Ação:**
1. Revisar o diff de cada arquivo (`git diff <arquivo>`).
2. Separar em commits lógicos (ex.: `feat: pagina produtos com paginacao`,
   `docs: auditoria geral`). Não misturar CSS com lógica no mesmo commit se
   forem mudanças independentes.
3. Se algum diff for experimento abandonado, descartar conscientemente
   (`git checkout -- <arquivo>`) — nunca descartar sem ler o diff antes.

**Critérios de aceite:**
- [ ] `git status` limpo (ou apenas arquivos intencionalmente ignorados).
- [ ] `npm test` e `npm run build` (prebuild guards) passando após os commits.

---

### P0.2 — Rate limit durável (fora da memória do processo)

**Contexto:** `src/lib/auth/rate-limit.ts` guarda tentativas em `Map` no
`globalThis`. Em ambiente serverless (Vercel), cada instância tem memória
própria: o contador zera em cold start e um atacante distribuído entre
instâncias contorna parcialmente o bloqueio.

**Arquivos-alvo:**
- `src/lib/auth/rate-limit.ts` (reescrever backend de armazenamento)
- `prisma/schema.prisma` (novo model)
- nova migration em `prisma/migrations/`
- `src/app/api/auth/login/route.ts` (as chamadas `checkLoginRateLimit`,
  `registerFailedLogin`, `clearFailedLogins` viram `async` — atualizar `await`)
- `tests/auth-rate-limit.test.ts` (adaptar ao novo backend)

**Implementação sugerida (Postgres, sem dependência externa):**

```prisma
model LoginAttempt {
  id             String    @id @default(cuid())
  key            String    @unique // `${ip}:${emailLower}`
  count          Int       @default(1)
  firstAttemptAt DateTime  @default(now())
  blockedUntil   DateTime?
  updatedAt      DateTime  @updatedAt

  @@index([updatedAt])
}
```

Regras (manter as atuais): janela 15 min, 5 tentativas, bloqueio 15 min.
- `checkLoginRateLimit`: `findUnique` por `key`; se `blockedUntil > now` →
  negar com `retryAfterSeconds`; se `firstAttemptAt` fora da janela → deletar
  registro e permitir.
- `registerFailedLogin`: `upsert` com incremento; ao atingir 5, gravar
  `blockedUntil = now + 15min`. Usar operação atômica (`increment`) — nunca
  ler-somar-escrever.
- `clearFailedLogins`: `deleteMany` por `key` (login com sucesso).
- Limpeza: apagar registros com `updatedAt` > 24h no próprio fluxo (ex.: a cada
  N chamadas) ou no cron existente (`/api/cron/auto-liberar-cura` NÃO — criar
  entrada própria no `vercel.json` ou anexar ao script de manutenção
  `scripts/maintenance/`).
- Falha de DB no rate limit **não pode derrubar o login** nem abrir brecha:
  em erro de leitura, negar por segurança apenas se já houver bloqueio
  conhecido; caso contrário registrar log estruturado e seguir (documentar a
  escolha no código).

**Critérios de aceite:**
- [ ] Migration criada (`prisma migrate dev`), sem `db push`.
- [ ] 6ª tentativa falha em 15 min → HTTP 429 com `retryAfterSeconds`, mesmo
      após reinício do processo (testável reiniciando o dev server).
- [ ] Login com sucesso limpa o contador.
- [ ] `tests/auth-rate-limit.test.ts` adaptado e passando; `npm test` verde.
- [ ] Guard `security:check-migrations` passando.

---

## 🟡 P1 — Importante

### P1.1 — Atualizar dependências vulneráveis

**Contexto:** `npm audit` → 5 vulnerabilidades (2 low, 3 moderate, 0 high/critical):
`js-yaml` (DoS quadrático — moderate), `next`→`postcss` (XSS no stringify —
moderate), `esbuild` (dev-only — low), `@babel/core` (low).

**Ação:**
1. `npm update next js-yaml`
2. `npm audit` novamente; se restar item moderate com fix disponível, aplicar.
3. Não usar `npm audit fix --force` (pode fazer major bump de `next`).

**Critérios de aceite:**
- [ ] `npm audit` sem moderate/high/critical (low dev-only aceitável).
- [ ] `npm run build` e `npm test` passando após o update.
- [ ] Smoke manual: login + uma listagem + uma criação funcionando.

---

### P1.2 — Ativar diff de migrations no CI (`SHADOW_DATABASE_URL`)

**Contexto:** o guard `scripts/check-prisma-migrations.mjs` avisa:
`SHADOW_DATABASE_URL ausente. Diff migrations x schema nao foi executado.`
Ou seja, drift entre `schema.prisma` e as migrations passaria despercebido.

**Ação:**
1. No `.github/workflows/ci.yml`, subir um Postgres de serviço:

```yaml
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_USER: ci
      POSTGRES_PASSWORD: ci
      POSTGRES_DB: shadow
    ports: ["5432:5432"]
    options: >-
      --health-cmd "pg_isready -U ci" --health-interval 5s
      --health-timeout 5s --health-retries 10
```

2. Exportar `SHADOW_DATABASE_URL: postgresql://ci:ci@localhost:5432/shadow`
   no `env` do job.
3. Confirmar que o guard executa o diff (sem o AVISO) no CI.

**Critérios de aceite:**
- [ ] CI verde com o diff executando (log do guard sem `AVISO - SHADOW_DATABASE_URL`).
- [ ] Teste negativo local: alterar um campo no schema sem migration → guard falha.

---

### P1.3 — Teste E2E do fluxo crítico (venda → estoque → financeiro)

**Contexto:** os 132 testes atuais são unitários/estruturais. Falta um teste de
integração do fluxo de negócio central: criar venda direta → baixa de estoque
(FIFO por lote) → conta a receber gerada → cancelamento → estorno.

**Arquivos-alvo:** novo `tests/e2e-direct-sale-flow.test.ts` (ou similar),
usando o mesmo runner (`tsx --test`).

**Implementação sugerida:** seguir o padrão dos testes existentes
(`direct-sale-service.test.ts`, `stock-transactions.test.ts`) — mock do
`TransactionClient` ou banco efêmero se já houver infra. Cobrir:
1. Venda com estoque suficiente → saldo decrementado, `DirectSale ATIVA`,
   `AccountReceivable` criada, `consumedLots` coerente.
2. Venda com estoque insuficiente (depósito `allowsNegative=false`) → erro,
   nada persiste (transação atômica).
3. Cancelamento → estoque estornado, status `CANCELADA`, auditoria gravada.

**Critérios de aceite:**
- [ ] 3 cenários acima cobertos e passando em `npm test`.
- [ ] Nenhuma alteração em código de produção para viabilizar o teste
      (exceto injeção de dependência mínima, se indispensável).

---

## 🔵 P2 — Melhoria (quando possível)

### P2.1 — Padronizar guards de API em `requireApiSession`

**Contexto:** coexistem dois padrões — `requireApiSession({ permission })`
(helper, ex.: `src/app/api/usuarios/route.ts`) e `getSession()` + checagem
manual de `session.permissions.includes(...)`
(ex.: `src/app/api/financeiro/contas-receber/route.ts:9-17`).

**Ação:** migrar todas as rotas para o helper, rota a rota, sem alterar a
semântica (mesma permissão exigida, mesmas mensagens). O guard de CI
`security:check-api-auth` deve continuar verde a cada rota migrada.

**Critérios de aceite:**
- [ ] `grep -rn "getSession()" src/app/api` → zero ocorrências fora de
      `auth/login`, `auth/logout`, `auth/me`.
- [ ] Mesmos status codes de antes (401/403) por rota (verificar com testes
      existentes `api-auth-guard.test.ts`).

### P2.2 — Higiene da raiz do repositório

- Remover logs de dev versionáveis já ignorados que sobraram no disco
  (`dev-*.log`, `dev-server.log`, `next-debug.*.log`).
- Remover `DESIGN.md` da raiz (análise da PlayStation — template obsoleto,
  não é referência do projeto; a referência de design é `DESIGN-PLAN.md`).
- Avaliar mover `Memory.md`, `soul.md`, `agent.md` para `docs/`.

**Critérios de aceite:**
- [ ] Raiz apenas com arquivos de configuração/documentação vigentes.
- [ ] Nenhuma referência quebrada (grep por `DESIGN.md` antes de remover).

### P2.3 — Documentar requisito de proxy para `x-forwarded-for`

**Contexto:** `getClientIp()` em `src/lib/auth/rate-limit.ts` confia no
primeiro IP de `x-forwarded-for`. Na Vercel isso é seguro (a plataforma
sobrescreve o header). **Se o app migrar para VPS/Nginx**, o Nginx precisa
sobrescrever (não repassar) o header, senão o rate limit é contornável por
spoofing de IP.

**Ação:** adicionar comentário no próprio `rate-limit.ts` + seção curta em
`docs/` (ex.: `docs/DEPLOY.md`) com o snippet Nginx:

```nginx
proxy_set_header X-Forwarded-For $remote_addr;  # sobrescreve, não anexa
```

**Critérios de aceite:**
- [ ] Comentário no código + doc de deploy atualizada.

---

## Fora de escopo deste documento (já resolvido — não retrabalhar)

- Atomicidade de estoque (`increment/decrement` + Serializable) ✅
- Rate limit básico no login (a P0.2 apenas troca o armazenamento) ✅
- Vazamento de `error.message` / logger estruturado ✅
- `getSession` fail-closed ✅
- HSTS / CSP de produção ✅
- Migrations + guard anti-`db push` ✅
- CI + 12 guards de segurança no prebuild ✅
- Backup S3 + restore drill + evidências ✅
- Limites de query (`query-limits.ts` + guard) ✅

## Checklist final (rodar após concluir P0–P1)

- [ ] `npm test` — 100% verde
- [ ] `npm run build` — todos os guards do prebuild verdes
- [ ] `npm audit` — sem moderate+
- [ ] CI verde no GitHub
- [ ] `git status` limpo
