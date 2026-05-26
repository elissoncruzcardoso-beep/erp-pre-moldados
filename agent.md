# Agent Guide - ERP Pre-Moldados

## Papel do agente
Voce esta trabalhando no MVP real de um ERP industrial para fabrica de pre-moldados. O objetivo e evoluir um prototipo visual aprovado pela diretoria para um sistema funcional, com banco Supabase, autenticacao, permissoes, produtos, estoque e producao.

## Como agir neste projeto
- Priorize implementacoes pequenas, testaveis e conectadas ao fluxo real da industria.
- Antes de alterar regras de negocio, leia `Memory.md`, `soul.md`, `docs/MVP_TECNICO.md` e `ERP_PRE_MOLDADOS.md` na pasta superior do workspace, se disponivel.
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
- Diretoria: pagina de apresentacao executiva.
- Dashboard: prototipo visual.
- Produtos: leitura real e cadastro real de item/produto.
- Estoque: movimentacao real com saldo e auditoria.
- Venda direta: recibo profissional, baixa de estoque, CRUD basico, cancelamento com estorno e impressao A4.
- Suprimentos: ambiente visual reorganizado para compras, contratos, recebimento e conferencia.
- Financeiro: prototipo visual.
- Usuarios: tela real protegida para visualizar usuarios, perfis e permissoes.

## Regras de seguranca
- Toda API real deve validar sessao.
- Toda API real deve checar permissao.
- Operacoes criticas devem gerar `AuditLog`.
- Nao permitir saldo negativo em deposito que nao permite negativo.
- Nao duplicar responsabilidade entre modulos.

## Proximo passo recomendado
Criar Ordem de Producao real:
1. Cadastro de OP com produto, quantidade, molde e data prevista.
2. Criacao das etapas padrao.
3. Consumo de estoque por saida para producao.
4. Apontamento de producao.
5. Entrada de produto acabado no estoque.
