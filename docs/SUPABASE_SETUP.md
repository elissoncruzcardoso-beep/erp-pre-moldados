# Configuração Supabase - ERP Pré-Moldados

## 1. Criar projeto no Supabase

1. Acesse https://supabase.com/dashboard
2. Crie uma organização/projeto.
3. Use Postgres 17, se disponível.
4. Guarde a senha do banco.

## 2. Copiar strings de conexão

No dashboard do projeto:

1. Abra `Project Settings`.
2. Entre em `Database`.
3. Copie a connection string.

Recomendação:

- `DATABASE_URL`: usar connection pooler quando formos rodar em produção/Vercel.
- `DIRECT_URL`: usar conexão direta para migrations.
- `npm.cmd run security:check-env` bloqueia `DATABASE_URL` direto do Supabase em ambiente Vercel.

Exemplo:

```env
DATABASE_URL="postgresql://postgres.PROJECT_REF:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres:SENHA@db.PROJECT_REF.supabase.co:5432/postgres"
AUTH_SECRET="troque-por-uma-chave-segura"
NEXT_PUBLIC_APP_NAME="ERP Pré-Moldados"
```

## 3. Conectar projeto local ao Supabase

No terminal:

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref PROJECT_REF
```

## 4. Enviar migrations para o Supabase

```powershell
npx.cmd supabase db push
```

As migrations atuais:

- `initial_mvp_schema`: cria a estrutura inicial do MVP.
- `enable_rls_private_mvp`: habilita RLS e fecha acesso direto por `anon/authenticated`.

## 5. Gerar Prisma Client e rodar seed

Com `.env` preenchido:

```powershell
npm.cmd run db:generate
npm.cmd run db:seed
```

Seed inicial cria:

- Perfis.
- Permissões.
- Usuário admin de desenvolvimento.
- Unidades de medida.
- Depósitos.
- Itens iniciais.
- Forma/molde inicial.

## 6. Segurança

Por padrão, as tabelas do MVP ficam:

- Com RLS habilitado.
- Sem permissão direta para `anon` e `authenticated`.
- Prontas para acesso via servidor Next.js usando Prisma.

Antes de expor qualquer tabela pela Data API do Supabase, criar políticas RLS específicas por módulo e perfil.

## 7. Próximo passo após conectar

Depois do banco estar online:

1. Criar tela de login.
2. Criar cadastro real de usuários/perfis.
3. Conectar produtos ao banco.
4. Conectar estoque ao banco.
5. Conectar ordens de produção ao banco.
