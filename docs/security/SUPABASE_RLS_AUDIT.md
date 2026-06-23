# Auditoria Supabase RLS - ERP Pre-Moldados

Data da auditoria: 31/05/2026

## Resultado encontrado

### 1. Comunicacao direta do frontend com Supabase

Nao foi encontrada comunicacao direta do frontend com o banco via Supabase Client.

Evidencias locais:

- Nao ha dependencia `@supabase/supabase-js` no `package.json`.
- Nao foram encontrados usos de `createClient` do Supabase no codigo.
- Nao foram encontradas variaveis `NEXT_PUBLIC_SUPABASE_*`.
- O frontend chama rotas internas `/api/...`.
- O acesso ao banco e feito no servidor Next.js via Prisma usando `DATABASE_URL`.

Conclusao: o desenho atual e mais seguro do que expor o banco diretamente no navegador. O risco principal e manter o Supabase Data API fechado para `anon` e `authenticated`.

## 2. RLS no banco real

Consulta executada contra o banco configurado em `.env`:

- Todas as 39 tabelas publicas do ERP consultadas estao com `relrowsecurity = true`.
- Nenhuma policy permissiva foi encontrada em `pg_policies`.
- Nenhum grant para `anon` ou `authenticated` foi encontrado em `information_schema.role_table_grants`.

Tabelas verificadas:

- `AccountPayable`
- `AccountPayment`
- `AccountReceipt`
- `AccountReceivable`
- `AuditLog`
- `Company`
- `Composition`
- `CompositionItem`
- `Customer`
- `DirectSale`
- `FinancialGroup`
- `FinancialSettlementType`
- `InputGroup`
- `Item`
- `Lot`
- `Mold`
- `PaymentMethod`
- `Permission`
- `ProductionBatch`
- `ProductionDailyLog`
- `ProductionDailyLogItem`
- `ProductionNote`
- `ProductionOrder`
- `ProductionStage`
- `PurchaseOrder`
- `PurchaseOrderItem`
- `PurchaseQuote`
- `PurchaseQuoteItem`
- `PurchaseReceipt`
- `PurchaseRequest`
- `PurchaseRequestItem`
- `Role`
- `RolePermission`
- `StockBalance`
- `StockMovement`
- `Supplier`
- `UnitOfMeasure`
- `User`
- `Warehouse`

## 3. Policies permissivas

Resultado: nenhuma policy encontrada no schema `public`.

Isso e adequado para a arquitetura atual, porque o app nao usa Supabase Auth direto no navegador. Sem policies e sem grants para `anon`/`authenticated`, a Data API fica fechada.

## 4. Risco de vazamento da service_role_key

Nao foi encontrada `service_role_key` no codigo, nem variavel `NEXT_PUBLIC_*` relacionada ao Supabase.

Regras obrigatorias:

- Nunca criar `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`.
- Nunca importar service role em componente React client-side.
- Se algum dia usar Supabase Client no frontend, usar apenas chave publica anon/publishable e RLS bem definido.
- Service role, se existir, deve ficar somente em variavel server-side no Vercel, sem prefixo `NEXT_PUBLIC_`.

## Observacao importante sobre `auth.uid()`

O ERP atual usa autenticacao propria por cookie e tabela `User` com `id` tipo CUID/string.

Ja o `auth.uid()` do Supabase Auth retorna UUID do usuario autenticado pelo Supabase.

Portanto, policies do tipo:

```sql
owner_id = auth.uid()
```

so devem ser ativadas se o projeto migrar ou integrar usuarios ao Supabase Auth, criando uma coluna `owner_id uuid` nos registros que precisam ser acessados diretamente pelo navegador.

Para a arquitetura atual, a blindagem recomendada e:

1. RLS ligado em todas as tabelas publicas.
2. Nenhuma policy ampla para `anon`.
3. Nenhum grant para `anon`/`authenticated`.
4. Toda leitura/escrita passando pelas APIs Next.js com Prisma, sessao e permissoes.

## Arquivo SQL gerado

Os scripts de auditoria e blindagem estao em:

`docs/security/supabase_rls_hardening.sql`

## Validacao local

O projeto tambem possui uma checagem local para evitar regressao no hardening:

```bash
npm run security:check-supabase-rls
```

Essa checagem falha se o SQL deixar de:

- habilitar RLS nas tabelas publicas;
- revogar acesso de `anon` e `authenticated`;
- revogar privilegios padrao para tabelas, sequencias e funcoes;
- bloquear grants ativos ou policies permissivas.

Ela roda tambem no `prebuild`.

Para auditar o banco real sem alterar nada:

```bash
npm run security:audit-supabase-live
```

Essa auditoria usa `SUPABASE_AUDIT_DATABASE_URL`, `DIRECT_URL` ou `DATABASE_URL`, nessa ordem. Ela executa apenas `SELECT` em catalogos do Postgres para validar RLS, grants, policies e funcoes expostas.

## Como aplicar com seguranca

1. Fazer backup ou snapshot antes.
2. Rodar primeiro as consultas de auditoria do arquivo SQL no Supabase SQL Editor.
3. Se houver grants ou RLS desligado, executar o bloco de hardening server-only.
4. Testar login, cadastros, estoque, producao, suprimentos, vendas e financeiro.
5. Rodar o Security Advisor do Supabase novamente.

Nao ativar o bloco futuro com `auth.uid()` enquanto o ERP usar autenticacao propria e Prisma no servidor.

Referencias usadas para esta decisao:

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/changelog
