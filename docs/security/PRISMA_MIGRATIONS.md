# Migrations Prisma

Este projeto agora possui uma migration baseline em:

`prisma/migrations/20260615000000_baseline/migration.sql`

Ela representa o schema atual do ERP e deve ser usada para criar bancos novos.

## Banco novo

Para um banco vazio:

```powershell
npm.cmd run db:migrate
npm.cmd run db:seed
```

## Banco existente no Supabase

Se o banco ja foi criado antes via `prisma db push`, nao rode a baseline diretamente sem conferir.

O fluxo correto e:

1. Fazer backup do banco.
2. Confirmar que o schema atual do banco bate com `prisma/schema.prisma`.
3. Marcar a baseline como aplicada:

```powershell
npx.cmd prisma migrate resolve --applied 20260615000000_baseline
```

Depois disso, novas alteracoes de schema devem virar novas migrations com:

```powershell
npm.cmd run db:migrate
```

## Regra do projeto

Evite `prisma db push` em producao. Use migrations versionadas para reduzir risco de drift.

## Guard automatizado

O projeto possui o check:

```powershell
npm.cmd run security:check-migrations
```

Ele valida se existem migrations versionadas, se cada pasta possui `migration.sql`, se existe `migration_lock.toml` e se `package.json`, CI ou `vercel.json` nao automatizam `prisma db push`.

Se `SHADOW_DATABASE_URL` estiver configurado, o check tambem executa `prisma migrate diff` entre `prisma/migrations` e `prisma/schema.prisma` para detectar drift real entre migration e schema.
