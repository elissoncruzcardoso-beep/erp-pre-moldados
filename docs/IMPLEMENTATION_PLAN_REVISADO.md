# Plano revisado de refinamento visual

O arquivo recebido em `Downloads/implementation_plan.md` foi gerado para uma estrutura diferente do ERP atual. Ele menciona Tailwind, tema dark, `Sidebar.tsx` e `Card.tsx`, mas este projeto usa App Router com CSS global em `src/app/globals.css`, layout próprio em `src/app/layout.tsx` e tema claro industrial.

## Decisão

Não aplicar o plano literalmente.

Aplicar somente os conceitos compatíveis:

- reduzir risco de overflow horizontal;
- melhorar scroll em tabelas e listas internas;
- padronizar foco, seleção e transições;
- manter o tema claro industrial já aprovado;
- preservar rotas, APIs, banco, permissões e regras de negócio.

## Ações aplicadas

- Ajuste global de `scroll-behavior`.
- Estilo de seleção de texto.
- Scrollbar discreta e consistente.
- Transições em links, botões e cards clicáveis.
- `table-shell` com scroll horizontal seguro quando necessário.
- Proteção de largura mínima em elementos de tabela e painéis.
- Fichas técnicas em `/produtos` reorganizadas como lista compacta, com consumo técnico recolhido.
- Edição de composição pela lista de produtos feita por modal centralizado.
- Edição de solicitações em Suprimentos feita por modal centralizado.
- Paginação ajustada para preservar o `pageSize` real e evitar retorno para a mesma lista.

## Não aplicado

- Conversão para tema dark.
- Alteração estrutural do layout raiz.
- Criação de sidebar mobile nova, pois o projeto já possui navegação mobile inferior.
- Mudança em regras de negócio, dados, APIs ou permissões.

## Padrão mantido

- Tema claro industrial.
- Fluxos reais já criados para produtos, composições, suprimentos, estoque, vendas e financeiro.
- Modais apenas para edição iniciada em listas/cards.
- Páginas próprias continuam existindo quando o fluxo exige cadastro completo.
