# Como abrir o ERP Pré-Moldados no VS Code

## 1. Pré-requisitos no outro PC

Instalar:

- Node.js LTS: https://nodejs.org
- VS Code: https://code.visualstudio.com

Depois de instalar o Node.js, abra o PowerShell e confira:

```powershell
node --version
npm.cmd --version
```

## 2. Abrir o projeto

1. Extraia o arquivo `.zip`.
2. Abra o VS Code.
3. Clique em `File > Open Folder`.
4. Selecione a pasta:

```text
erp-pre-moldados-prototype
```

## 3. Instalar dependências

No terminal do VS Code, rode:

```powershell
npm.cmd install
```

## 4. Rodar localmente

No terminal do VS Code:

```powershell
npm.cmd run dev -- -H 127.0.0.1 -p 3000
```

Abrir no navegador:

```text
http://127.0.0.1:3000/diretoria
```

## 5. Telas principais

- Diretoria: `http://127.0.0.1:3000/diretoria`
- Dashboard: `http://127.0.0.1:3000/dashboard`
- Produção: `http://127.0.0.1:3000/producao`
- Relatórios de Produção: `http://127.0.0.1:3000/producao/relatorios`
- Suprimentos: `http://127.0.0.1:3000/suprimentos`
- Estoque: `http://127.0.0.1:3000/estoque`
- Financeiro: `http://127.0.0.1:3000/financeiro`

## 6. Link publicado no Vercel

Também é possível abrir sem instalar nada:

```text
https://erp-pre-moldados-prototype.vercel.app/diretoria
```

## Observação

Este projeto ainda é um protótipo visual, sem backend e sem banco de dados. As ações clicáveis simulam comportamento para validação com a diretoria e usuários.

## 7. Evolução para MVP real

A base técnica do MVP começou a ser preparada com Prisma e PostgreSQL.

Veja:

```text
docs/MVP_TECNICO.md
```

Para conectar banco real, copie `.env.example` para `.env` e preencha `DATABASE_URL`.
