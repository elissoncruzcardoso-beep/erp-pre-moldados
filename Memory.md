# Memory - ERP Industrial para Pre-Moldados

## Contexto do projeto
O projeto nasceu como um prototipo visual para apresentar a diretoria e foi aprovado para evoluir para MVP real. A empresa atua com industria de pre-moldados, entao o dominio principal envolve pecas, formas/moldes, concreto, armaduras, cura, lotes, estoque, suprimentos, financeiro e producao por ordem.

## Caminhos importantes
- Projeto Next.js: `C:\Users\Elisson - Civiltec\Documents\New project\erp-pre-moldados-prototype`
- Documento principal: `C:\Users\Elisson - Civiltec\Documents\New project\ERP_PRE_MOLDADOS.md`
- Plano tecnico: `docs/MVP_TECNICO.md`
- Setup Supabase: `docs/SUPABASE_SETUP.md`
- Deploy Vercel ja usado: `https://erp-pre-moldados-prototype.vercel.app`

## Decisoes ja tomadas
- O MVP real comecou por banco de dados, autenticacao, usuarios, produtos, estoque e producao.
- Supabase sera o banco PostgreSQL.
- Prisma e usado como camada de acesso a dados.
- O projeto usa autenticacao propria temporaria por cookie assinado.
- `AUTH_SECRET` precisa estar configurado no `.env`.
- O admin inicial e `admin@erp.local`.
- A tela `/setup-admin` permite definir ou redefinir a senha do administrador no ambiente de desenvolvimento.
- O modulo Suprimentos nao deve conter movimentacao de estoque.
- O grupo antigo `Estoque` dentro de Suprimentos foi substituido por `Recebimento e Conferencia`.
- Movimentacao oficial de saldo, lote e inventario fica somente no modulo Estoque.

## Estado funcional atual
### Login e usuarios
- Login em `/login`.
- Setup/redefinicao do admin em `/setup-admin`.
- Visualizacao de usuarios e perfis em `/usuarios`.
- Permissoes centralizadas em `src/lib/permissions/permissions.ts`.

### Produtos
- Rota: `/produtos`.
- Le dados reais de `Item`, `UnitOfMeasure`, `Composition` e `Mold`.
- Possui formulario real para cadastrar produto/item.
- API: `POST /api/produtos`.
- Gera auditoria em `AuditLog`.

### Estoque
- Rota: `/estoque`.
- Le dados reais de `StockBalance`, `StockMovement`, `Warehouse`, `Item` e `Lot`.
- Possui formulario real para movimentacao.
- API: `POST /api/estoque/movimentacoes`.
- Tipos implementados:
  - `ENTRADA_COMPRA`
  - `SAIDA_PRODUCAO`
  - `ENTRADA_PRODUCAO`
  - `TRANSFERENCIA`
  - `AJUSTE_POSITIVO`
  - `AJUSTE_NEGATIVO`
  - `RESERVA`
- Atualiza saldo em `StockBalance`.
- Registra movimento em `StockMovement`.
- Registra auditoria em `AuditLog`.

### Suprimentos
- Rota: `/suprimentos`.
- Ainda e ambiente visual.
- Estrutura:
  - Compras
  - Contratos e Medicoes
  - Recebimento e Conferencia
- Recebimento deve preparar/liberar entrada, mas a entrada real continua no modulo Estoque.

## Problemas resolvidos
- `localhost recusou conexao`: servidor local estava desligado; usar `npm.cmd run dev`.
- `spawn EPERM`: Next dev precisou rodar fora do sandbox.
- Erro TLS Prisma/Supabase no Windows: projeto passou a usar `@prisma/adapter-pg` e `pg`.
- Login ficava na tela: ajustado para usar navegacao direta via `window.location.assign`.
- Senha admin perdida: `/setup-admin` agora redefine a senha.

## Cuidados
- Nunca commitar `.env`.
- Nao imprimir senha, connection string completa ou tokens em resposta.
- Se mover para outro PC, copiar `.env.example` e recriar `.env` com os valores reais.
- Rodar `npm.cmd install` no novo PC.
- Rodar `npm.cmd run db:generate` se Prisma Client precisar ser regenerado.

## Proximas entregas sugeridas
1. Ordem de Producao real.
2. Apontamento de Producao.
3. Consumo automatico de insumos pela ficha tecnica.
4. Entrada de produto acabado no estoque.
5. Solicitacao de Compra real.
6. Pedido de Compra real.
7. Recebimento integrado ao pedido e entrada no estoque.
