# Backup externo em AWS S3

Este guia prepara o bucket externo para receber backups do PRECAST ERP sem expor dados.

## Objetivo

O backup externo deve ficar fora do servidor da aplicacao e fora do Supabase. A meta e proteger contra erro humano, exclusao acidental, invasao, falha do provedor principal ou perda do servidor local.

## Configuracao minima do bucket

Crie um bucket privado e aplique estes controles:

1. Bloquear acesso publico com as quatro opcoes ativas:
   - `BlockPublicAcls`
   - `IgnorePublicAcls`
   - `BlockPublicPolicy`
   - `RestrictPublicBuckets`
2. Habilitar versionamento.
3. Habilitar criptografia padrao:
   - `AES256` como base segura;
   - `aws:kms` recomendado quando a empresa quiser controle maior de chave e auditoria.
4. Aplicar bucket policy negando conexao sem TLS.
5. Criar lifecycle para retencao:
   - backups diarios por 30 dias;
   - backups mensais por 12 meses;
   - transicao para Glacier/Deep Archive quando fizer sentido.
6. Avaliar Object Lock para tornar backups imutaveis por periodo definido.

## Politicas deste diretorio

- `iam-backup-writer-policy.json`
  - Politica para usuario/role exclusivo de backup.
  - Permite listar, ler e gravar apenas nos prefixos do ERP.
  - Nao concede `s3:DeleteObject`.

- `bucket-deny-insecure-transport-policy.json`
  - Politica do bucket para bloquear qualquer operacao sem TLS.

Antes de aplicar, substitua:

```text
SEU_BUCKET_BACKUP
```

pelos nomes reais.

## Variaveis no servidor/agendador

Guarde estas variaveis fora do repositorio, em arquivo protegido ou cofre de segredo:

```env
BACKUP_DATABASE_URL="postgresql://..."
BACKUP_S3_BUCKET="seu-bucket-privado"
BACKUP_S3_PREFIX="precast-erp/postgres"
AWS_REGION="sa-east-1"
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."
BACKUP_S3_KMS_KEY_ID="opcional"
```

Nunca use `NEXT_PUBLIC_` em variaveis de backup.

Existe um template sem segredo real em:

```text
docs/security/backups/precast-backup.env.template
```

Copie esse template para fora do projeto, por exemplo `C:\seguro\precast-backup.env`.
Se o agendador definir `PRECAST_BACKUP_ENV_FILE`, os checks usam esse arquivo automaticamente:

```powershell
$env:PRECAST_BACKUP_ENV_FILE="C:\seguro\precast-backup.env"
npm run backup:readiness
```

## Auditoria local

Depois de configurar o bucket e as credenciais no servidor:

```powershell
npm run backup:check-s3 -- --env-file "C:\seguro\precast-backup.env"
```

Para gravar evidencia operacional segura:

```powershell
npm run backup:check-s3 -- --env-file "C:\seguro\precast-backup.env" --write-evidence "docs/security/backups/s3-posture-latest.json"
```

Para validar a evidencia gravada:

```powershell
npm run backup:check-s3-evidence
```

Para saida em JSON:

```powershell
npm run backup:check-s3 -- --env-file "C:\seguro\precast-backup.env" --json
```

O comando valida:

- formato do bucket;
- bloqueio publico ativo;
- criptografia padrao;
- versionamento ativo;
- bucket policy exigindo TLS;
- lifecycle configurado;
- Object Lock, quando existir.

Lifecycle e Object Lock geram aviso quando ausentes. Bloqueio publico, criptografia, versionamento e TLS sao tratados como bloqueios.

## Ordem recomendada

1. Criar bucket S3 privado.
2. Ativar bloqueio publico completo.
3. Ativar versionamento.
4. Ativar criptografia padrao.
5. Aplicar bucket policy de TLS.
6. Criar usuario/role IAM exclusivo.
7. Anexar politica minima de backup.
8. Configurar variaveis no servidor/agendador.
9. Rodar `npm run backup:check-config`.
10. Rodar `npm run backup:check-s3`.
11. Rodar `npm run backup:check-s3 -- --write-evidence "docs/security/backups/s3-posture-latest.json"`.
12. Executar backup completo manual.
13. Executar restore drill em banco temporario.
14. Rodar `npm run backup:readiness`.
