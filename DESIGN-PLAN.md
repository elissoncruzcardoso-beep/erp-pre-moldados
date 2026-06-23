# Plano de Design — ERP Pré-Moldados

> Guia de melhoria visual **incremental e não-destrutiva**, pensado para rodar
> em paralelo às correções de backend (Codex) sem quebrar nenhuma função ou regra.
>
> **Status:** projeto em produção. Toda mudança deve ser reversível e isolada.

---

## 0. Contexto do sistema de design atual

- **Sem Tailwind.** O design vive em **`src/app/globals.css`** (~5.160 linhas):
  tokens em `:root` + classes semânticas (`.card`, `.metric-card`, `.table-shell`,
  `.primary-button`, `.badge`, `.module-tab`, etc.).
- **Markup** usa essas classes nos `page.tsx` e nos componentes de `_components/`.
- **Shell** (sidebar + topbar + mobile-nav) está em `src/app/layout.tsx`.
- O arquivo `DESIGN.md` da raiz é uma **análise da PlayStation (template obsoleto)**
  — não é referência deste ERP. Pode ser removido.

### Tokens principais (`:root`)
```
--primary #1a237e   --primary-deep #000666   --primary-soft #e0e3ff
--warning #ff6f00   --danger #ba1a1a         --success #1b6b45
--surface #f3f5f8   --surface-strong #fff     --surface-steel #202735
--text #1a1c1c      --text-muted #5d6064      --border #d9dee7
--radius 10px       --radius-lg 16px
--sans Inter        --headline "IBM Plex Sans"  --mono "JetBrains Mono"
```

---

## 1. Fronteiras de trabalho (evitar colisão com o Codex)

| Zona | Arquivos | Responsável |
|------|----------|-------------|
| **Design** | `src/app/globals.css`, `className` nos `.tsx`, `src/app/layout.tsx` | Design |
| **Lógica / regras** | `src/lib/**`, `src/app/api/**/route.ts`, `prisma/`, `middleware.ts` | Codex |
| **Atrito possível** | `page.tsx` (se o Codex adicionar paginação/`take`/props) | Combinar |

**Regra de ouro:** mudar *como aparece*, nunca *o que envia / valida / autoriza*.

### Nunca tocar (quebra função)
- `name` / `id` / `value` de campos de formulário.
- `onSubmit`, `onChange`, chamadas `fetch` / `api-client`.
- Server Components que buscam dados (queries Prisma, props passadas ao client).
- Checagens de permissão / `redirect` / guards.
- Nomes de rota.

### Pode mexer à vontade
- Qualquer regra CSS, tokens, cores, espaçamento, tipografia, sombras, raios.
- Valor de `className` (desde que a classe exista no CSS).
- Ícones (`lucide-react`), estados visuais (hover, focus, loading, vazio).
- Estrutura visual / responsividade.

---

## 2. Roadmap incremental (cada etapa isolada e reversível)

### Etapa 1 — Tokens + Fontes  🔴 maior impacto, risco zero de lógica
**Problema:** as fontes declaradas (`Inter`, `IBM Plex Sans`, `JetBrains Mono`)
**não são carregadas** — não há `next/font`, `@font-face` nem `@import`. Hoje cai
no fallback do sistema (Segoe UI / Arial / Consolas).

**Ação:**
- Carregar as 3 fontes via `next/font` (self-hosted → compatível com o CSP atual
  `font-src 'self'`, sem liberar CDN externo).
- Aplicar as variáveis de fonte no `<body>` / `:root`.
- Revisar/centralizar tokens de cor e raio.

**Arquivos:** `src/app/layout.tsx`, topo de `src/app/globals.css`.
**Não toca** markup de dados nem lógica.

### Etapa 2 — Shell (sidebar + topbar + mobile-nav)
Refinar `app-shell`, `sidebar`, `topbar`, `mobile-nav` (espaçamento, hierarquia,
estados ativos do menu, contraste).
**Arquivos:** `globals.css` + `layout.tsx`. Codex não atua aqui.

### Etapa 3 — Módulo a módulo
Ordem sugerida: **dashboard → estoque → financeiro → produção → suprimentos →
cadastros → usuários**.
Para cada módulo: refinar só as classes daquele conjunto de telas.
**Regra:** fazer *merge do backend do Codex antes* de pegar um módulo que ele vá tocar.

### Etapa 4 — Responsividade  🟠
Hoje há apenas **9 `@media`** para **36 páginas**. Tabelas densas
(`.finance-data-table` `min-width:860px`, estoque, suprimentos) quebram em
tablet/mobile.
**Ação:** auditar breakpoints, tornar tabelas roláveis/empilháveis, validar a
`mobile-nav`. Puramente visual.

### Etapa 5 (opcional) — Modularizar o CSS
Quebrar `globals.css` (5.160 linhas) em arquivos por módulo.
**Maior risco de regressão e de conflito** — fazer **só depois** que todo o
backend do Codex estiver mergeado. Pode ser pulado.

---

## 3. Polimentos de baixo risco (encaixar em qualquer etapa)
- Padronizar raio/sombra entre `.card` (16px) e `.product-metric-card` (20px) —
  hoje divergem.
- Estados vazios e de carregamento consistentes.
- Tokenizar cores hardcoded espalhadas (`#f8fafc`, `#eff6ff`, etc.) para variáveis.
- Manter `:focus-visible` (acessibilidade já existe — preservar).

---

## 4. Checklist "não quebra nada" (por commit)
- [ ] Mexi só em CSS e em valores de `className`.
- [ ] Se renomeei classe, troquei nos dois lados (CSS + JSX) no mesmo commit.
- [ ] Abri a tela antes/depois e o fluxo (criar / salvar / listar) funciona idêntico.
- [ ] Não alterei `name`/`value`/`fetch`/props de dados.
- [ ] Trabalho na branch `feat/ui-refresh`; backend do Codex mergeado primeiro.

---

## 5. Sequência de merge recomendada
1. Codex finaliza correções críticas de backend (estoque atômico, rate limit, etc.).
2. Merge do backend na branch principal.
3. Rebase de `feat/ui-refresh` sobre a principal.
4. Avançar nas etapas de design 1 → 4 (5 opcional).
