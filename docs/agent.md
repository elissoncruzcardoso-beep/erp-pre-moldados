# Agent Guide - ERP Pre-Moldados

## Papel do agente
Voce esta trabalhando no MVP real de um ERP industrial para fabrica de pre-moldados. O objetivo e evoluir um prototipo visual aprovado pela diretoria para um sistema funcional, com banco Supabase, autenticacao, permissoes, produtos, estoque e producao.

## Como agir neste projeto
- Priorize implementacoes pequenas, testaveis e conectadas ao fluxo real da industria.
- Antes de alterar regras de negocio, leia `docs/Memory.md`, `docs/soul.md`, `docs/MVP_TECNICO.md` e `ERP_PRE_MOLDADOS.md` na pasta superior do workspace, se disponivel.
- Nao exponha segredos do `.env`. Use `.env.example` para documentar variaveis.
- Mantenha o design industrial ja aprovado: azul institucional, cinzas concretos, laranja para alertas, grid denso, tabelas fortes e cards tecnicos.
- Preserve a separacao dos modulos:
  - Suprimentos: solicitacao, cotacao, pedido, contrato, recebimento e conferencia.
  - Estoque: saldos, lotes, reservas, entradas, saidas, transferencias, ajustes e inventario.
  - Producao: ordens, etapas, consumo, apontamentos, cura, qualidade e entrada de produto acabado.

## Subagentes recomendados
Use subagentes somente para tarefas bem delimitadas e, por padrao, em modo read-only ate existir uma decisao de implementacao.

- QA: testa fluxos ponta a ponta, reproduz erros e lista cenarios criticos antes de publicar.
- Banco/Prisma: revisa schema, relacoes, migrations, integridade de estoque, lotes, financeiro e auditoria.
- Seguranca: revisa autenticacao, permissoes, exposicao de dados, auditoria, endpoints criticos e segredos.
- Design/UI: revisa layout, responsividade, densidade, impressao A4, padrao visual e consistencia entre modulos.
- Fluxo ERP: revisa coerencia operacional entre suprimentos, producao, estoque, financeiro, vendas e relatorios.

Ao receber retorno dos subagentes, priorize achados por risco para o negocio: perda de estoque, financeiro incorreto, falha de permissao, quebra de fluxo e problemas visuais que impeçam uso.

## Stack atual
- Next.js App Router
- React
- TypeScript
- Prisma
- Supabase PostgreSQL
- Zod
- lucide-react
- CSS global em `src/app/globals.css`

## Comandos importantes
```powershell
npm.cmd run dev
npm.cmd run build
npm.cmd run db:generate
npm.cmd run db:seed
npm.cmd run user:set-admin-password
```

## Autenticacao
O projeto usa sessao propria por cookie assinado com `AUTH_SECRET`.

Arquivos principais:
- `src/lib/auth/session.ts`
- `src/lib/auth/password.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/logout/route.ts`
- `src/app/api/auth/me/route.ts`
- `src/app/login/page.tsx`
- `src/app/setup-admin/page.tsx`

## Banco de dados
Schema principal em `prisma/schema.prisma`.

Modelos mais importantes:
- `User`, `Role`, `Permission`, `RolePermission`
- `Item`, `UnitOfMeasure`, `Composition`, `CompositionItem`, `Mold`
- `Warehouse`, `StockBalance`, `StockMovement`, `Lot`
- `DirectSale` para recibos de venda direta com baixa/estorno de estoque
- `ProductionOrder`, `ProductionStage`, `ProductionNote`
- `AuditLog`

## Modulos ja iniciados
- Dashboard: resumo operacional real com cuidado para usar agregacoes e evitar divergencia entre producao, estoque, vendas e financeiro.
- Produtos: leitura real de itens e fichas tecnicas; cadastro de produtos fica em `/cadastros/produtos`.
- Produtos/composicoes: fichas tecnicas em lista compacta, detalhes de insumos recolhidos e edicao rapida por modal em `/produtos`.
- Estoque: movimentacao real com saldo, lotes, auditoria, filtros de saldo e permissao especifica para editar/excluir movimentacoes.
- Venda direta: pagina dedicada em `/vendas`, multi-itens, recibo profissional, baixa de estoque, contas a receber, cancelamento com estorno e impressao A4.
- Suprimentos: paginas separadas para solicitacoes, cotacoes, pedidos, notas fiscais e relatorios.
- Suprimentos/solicitacoes: criacao com varios itens, lista por card e edicao por modal.
- Financeiro: contas a pagar e contas a receber reais, baixas, estornos controlados, filtros e auditoria.
- Cadastros: produtos, clientes, fornecedores, unidades, grupos de insumos, grupos financeiros, formas de pagamento e tipos de baixa.
- Usuarios: tela real protegida para visualizar usuarios, perfis, permissoes e matriz de acesso.

## Regras de seguranca
- Toda API real deve validar sessao.
- Toda API real deve checar permissao.
- Operacoes criticas devem gerar `AuditLog`.
- Nao permitir saldo negativo em deposito que nao permite negativo.
- Nao duplicar responsabilidade entre modulos.

## Padroes recentes de UI
- Formularios longos nao devem abrir espremidos dentro de cards estreitos.
- Para edicao rapida de registros em listas, preferir modal centralizado com fundo escurecido, cabecalho com codigo do registro e acoes no rodape.
- Para leitura de registros tecnicos, preferir lista compacta com detalhes recolhidos (`details/summary`) e tabelas internas com rolagem segura.
- Paginacao deve preservar o `pageSize` real da lista atual; nao forcar `pageSize=20` quando a tela usa outro tamanho.

## Proximo passo recomendado
Consolidar estabilidade antes da integracao fiscal:
1. Revisar pendencias do worktree e commitar em pacote coerente.
2. Validar no navegador os fluxos alterados: produtos/fichas, solicitacoes, estoque, vendas e financeiro.
3. Em seguida, iniciar a etapa fiscal Focus NFe em homologacao, com backend proprio e sem token no frontend.
