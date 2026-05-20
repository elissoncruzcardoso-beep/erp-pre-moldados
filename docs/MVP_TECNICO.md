# MVP Técnico - ERP Pré-Moldados

## Objetivo desta etapa

Transformar o protótipo visual em uma base real de sistema, começando por:

- Banco de dados PostgreSQL.
- Prisma ORM.
- Usuários, perfis e permissões.
- Produtos e matérias-primas.
- Estoque, lotes e movimentos.
- Produção, ordens, etapas e apontamentos.
- Auditoria de ações críticas.

## Status atual

Implementado nesta fundação:

- `prisma/schema.prisma` com o modelo inicial do MVP.
- `src/lib/db/prisma.ts` com Prisma Client inicializado de forma lazy.
- `src/lib/permissions/permissions.ts` com permissões e perfis iniciais.
- `src/lib/auth/password.ts` com hash e verificação de senha usando `scrypt`.
- `src/lib/auth/access-control.ts` com checagem de permissões por perfil.
- Validações Zod em `src/lib/validations`.
- `prisma/seed.ts` com perfis, permissões, unidades, depósitos e itens iniciais.
- `.env.example` com variáveis necessárias.

## Configurar banco PostgreSQL

Criar um banco PostgreSQL no Supabase, Neon ou outro provedor.

Depois criar o arquivo `.env` na raiz do projeto:

```env
DATABASE_URL="postgresql://usuario:senha@host:5432/erp_pre_moldados?schema=public"
DIRECT_URL="postgresql://usuario:senha@host:5432/erp_pre_moldados?schema=public"
AUTH_SECRET="troque-por-uma-chave-segura"
NEXT_PUBLIC_APP_NAME="ERP Pré-Moldados"
```

## Supabase

O projeto já possui estrutura Supabase local:

```text
supabase/config.toml
supabase/migrations/
supabase/seed.sql
```

Migrations criadas:

- `initial_mvp_schema`: cria tabelas, enums, índices e relacionamentos do MVP.
- `enable_rls_private_mvp`: habilita RLS e fecha acesso direto por `anon/authenticated`.

Observação de segurança: as tabelas ficam no schema `public`, mas o acesso pela Data API deve permanecer fechado até criarmos políticas RLS por módulo. O app usará Prisma no servidor do Next.js para acessar o banco com credenciais seguras.

Para vincular a um projeto Supabase cloud, crie o projeto no dashboard e pegue:

- Project ref.
- Database password.
- Connection string PostgreSQL.

Depois rode:

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref SEU_PROJECT_REF
npx.cmd supabase db push
```

Em seguida preencha `.env` com a connection string do Supabase e rode:

```powershell
npm.cmd run db:generate
npm.cmd run db:seed
```

Guia detalhado:

```text
docs/SUPABASE_SETUP.md
```

## Comandos

Instalar dependências:

```powershell
npm.cmd install
```

Gerar Prisma Client:

```powershell
npm.cmd run db:generate
```

Criar as tabelas no banco:

```powershell
npm.cmd run db:migrate -- --name initial_mvp
```

Rodar dados iniciais:

```powershell
npm.cmd run db:seed
```

Abrir painel visual do banco:

```powershell
npm.cmd run db:studio
```

## Perfis iniciais

- Administrador.
- Diretoria.
- Produção.
- Almoxarifado.
- Suprimentos.
- Financeiro.
- Qualidade.

## Entidades principais

- `User`, `Role`, `Permission`, `RolePermission`.
- `Company`, `Customer`, `Supplier`.
- `UnitOfMeasure`, `Item`.
- `Warehouse`, `Lot`, `StockBalance`, `StockMovement`.
- `Mold`, `Composition`, `CompositionItem`.
- `ProductionOrder`, `ProductionStage`, `ProductionNote`.
- `AuditLog`.

## Próxima etapa recomendada

Depois de conectar o banco:

1. Criar autenticação real.
2. Criar telas reais de usuários e perfis.
3. Criar CRUD de produtos e matérias-primas.
4. Criar entrada/saída de estoque com saldo real.
5. Criar ordens de produção com apontamentos reais.
