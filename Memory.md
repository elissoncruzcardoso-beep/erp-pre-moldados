# Memory - ERP Industrial para Pre-Moldados

## Contexto do projeto
O projeto nasceu como um prototipo visual para apresentar a diretoria e foi aprovado para evoluir para MVP real. A empresa atua com industria de pre-moldados, entao o dominio principal envolve pecas, formas/moldes, concreto, armaduras, cura, lotes, estoque, suprimentos, financeiro e producao por ordem.

## Caminhos importantes
- Projeto Next.js: `C:\Users\Elisson - Civiltec\Documents\New project\erp-pre-moldados-prototype`
- Documento principal: `C:\Users\Elisson - Civiltec\Documents\New project\ERP_PRE_MOLDADOS.md`
- Plano tecnico: `docs/MVP_TECNICO.md`
- Setup Supabase: `docs/SUPABASE_SETUP.md`
- Estrategia visual do ERP: `docs/ESTRATEGIA_UI_UX_ERP.md`
- Aproveitamento do Google Stitch: `docs/STITCH_APROVEITAMENTO.md`
- Arquivo Figma criado para referencia visual: `https://www.figma.com/design/p5KAUSLooteOMsUz0IdLE9`
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
- A pagina/modulo Diretoria foi retirada da navegacao. O resumo executivo de producao deve ser solicitado pelo bot futuramente, nao mantido como pagina fixa do ERP.
- O fluxo simplificado de chao de fabrica e: Diario de Producao -> Lote em cura -> Liberacao por lote -> Dashboard.
- Sempre que um comando puder apagar dados, resetar banco, sobrescrever schema, derrubar processo importante, trocar configuracao ou prejudicar o andamento ja criado, perguntar ao usuario antes.
- O usuario esta priorizando evolucao incremental: preservar o que funciona, corrigir layout com cuidado e manter a logica atual quando a tarefa for visual.
- O ZIP do Google Stitch foi extraido apenas como referencia local em `stitch-reference/`, que esta no `.gitignore`.
- Usar apenas as partes boas do Stitch: design system industrial, cards, tabelas, badges, formularios e responsividade. Nao copiar HTML inteiro nem substituir regras do ERP.
- Integracao fiscal com Focus NFe sera tratada como nova etapa do ERP, comecando por NF-e de venda direta em homologacao antes de CT-e/MDF-e.
- A Focus usa API REST HTTPS e fluxo com referencia unica `ref`; no ERP, essa referencia deve vir da venda/recibo, por exemplo `VENDA-REC-...`.
- Tokens da Focus devem ficar somente no `.env`/Vercel Environment Variables e nunca no frontend.

## Estado funcional atual
### Login e usuarios
- Login em `/login`.
- Setup/redefinicao do admin em `/setup-admin`.
- Visualizacao de usuarios e perfis em `/usuarios`.
- Permissoes centralizadas em `src/lib/permissions/permissions.ts`.

### Produtos
- Rota: `/produtos`.
- Le dados reais de `Item`, `UnitOfMeasure` e `Composition`.
- Cadastro de produtos/itens foi direcionado para o modulo Cadastros.
- API: `POST /api/produtos`.
- Gera auditoria em `AuditLog`.
- Fichas tecnicas/composicoes existem como CRUD real:
  - criar composicao: `/produtos/composicoes/nova`
  - editar composicao: `/produtos/composicoes/[id]/editar`
  - APIs: `POST /api/produtos/composicoes`, `PATCH/DELETE /api/produtos/composicoes/[id]`
- A composicao deve abrir em pagina propria, nao como formulario espremido dentro do card.
- A grade de composicao usa tabela rolavel interna; linhas devem aparecer ao clicar em `Insumo`.
- Ficha tecnica usada em ordem de producao fica travada para edicao/exclusao.
- Evitar reintroduzir o antigo catalogo tecnico dentro de `/produtos`; cadastro de produto deve ficar em `/cadastros/produtos`.

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
- O modulo foi separado em paginas:
  - `/suprimentos/solicitacoes`
  - `/suprimentos/cotacoes`
  - `/suprimentos/pedidos`
  - `/suprimentos/notas-fiscais`
  - `/suprimentos/relatorios`
- Solicitacoes, cotacoes, pedidos e notas fiscais possuem CRUD/ajustes reais.
- Cotacoes devem permitir varios fornecedores e mapa comparativo.
- Mapa comparativo deve destacar melhor valor por item e fornecedor vencedor.
- Pedido aprovado gera base para nota fiscal.
- Nota fiscal deve puxar automaticamente itens e valor liquido aprovado do pedido, permitindo ajuste de quantidade e valor unitario em caso de imprevisto.
- Nota fiscal/recebimento deve gerar titulo em contas a pagar.
- Recebimento deve preparar/liberar entrada, mas a entrada real de saldo continua rastreada pelo fluxo de estoque/movimentacoes.

### Financeiro
- Rotas principais:
  - `/financeiro`
  - `/financeiro/contas-pagar`
  - `/financeiro/contas-receber`
- Contas a pagar sao vinculadas a recebimento/NF.
- Existe baixa/pagamento de contas a pagar, registrando data, valor pago e historico financeiro.
- Contas a receber reais foram iniciadas para completar o fluxo de caixa.

### Fiscal / Focus NFe
- Integracao fiscal planejada com Focus NFe.
- Primeiro escopo: emitir NF-e a partir de venda direta.
- Documentacao base verificada:
  - Introducao: `https://doc.focusnfe.com.br/reference/introducao`
  - Emitir NF-e: `https://doc.focusnfe.com.br/reference/emitir_nfe`
  - Consultar NF-e: `https://doc.focusnfe.com.br/reference/consultar_nfe`
  - Cancelar NF-e: `https://doc.focusnfe.com.br/reference/cancelar_nfe`
  - Webhooks: `https://doc.focusnfe.com.br/reference/criar_webhook`
  - Emitir CT-e: `https://doc.focusnfe.com.br/reference/emitir_cte`
  - Emitir MDF-e: `https://doc.focusnfe.com.br/reference/emitir_mdfe`
- Endpoints principais observados na documentacao:
  - `POST https://api.focusnfe.com.br/v2/nfe`
  - `GET https://api.focusnfe.com.br/v2/nfe/{referencia}`
  - `DELETE https://api.focusnfe.com.br/v2/nfe/{referencia}`
  - `POST https://api.focusnfe.com.br/v2/hooks`
  - `POST https://api.focusnfe.com.br/v2/cte`
  - `POST https://api.focusnfe.com.br/v2/mdfe`
- Criar futuro modulo/tela `Fiscal > NF-e`, com vendas pendentes, emissao, consulta de status, download XML/PDF/DANFE, cancelamento e historico fiscal.
- Criar futura tabela de documento fiscal vinculada a venda/recibo, com status como `PENDENTE`, `ENVIADA`, `PROCESSANDO`, `AUTORIZADA`, `REJEITADA`, `CANCELADA`.
- Criar futuro backend `FocusNfeClient` para montar JSON e comunicar com a Focus; o frontend nunca deve chamar a Focus diretamente.
- Criar futuro webhook interno `/api/fiscal/focus/webhook` para receber alteracoes de status.
- Antes de emitir em producao, cadastrar/validar dados fiscais da empresa, cliente e produto: CNPJ/CPF, IE/indicador IE, endereco completo, NCM, CFOP, unidade tributavel, origem, CST/CSOSN e impostos.
- CT-e e MDF-e ficam para fase posterior, depois de NF-e de venda direta estar validada em homologacao.

### Producao
- Rotas principais:
  - `/producao`
  - `/producao/diario`
  - `/producao/pecas-em-cura`
  - `/producao/relatorios`
- Diario de Producao e a base para o futuro bot via WhatsApp/Telegram.
- Diario coleta equipe presente, clima, item produzido, quantidade e observacoes.
- Ao salvar diario, gera registros de producao/lotes em cura conforme a regra implementada.
- Pecas em cura podem ser liberadas por lote para ficarem aptas a retirada.
- Relatorios de producao devem evoluir com exportacao PDF.
- Layout do Diario foi corrigido para nao comprimir formulario e historico lado a lado em telas menores.

### Cadastros
- Rotas principais:
  - `/cadastros`
  - `/cadastros/unidades`
  - `/cadastros/grupos-insumos`
  - `/cadastros/grupos-financeiros`
  - `/cadastros/produtos`
- Unidades, grupos de insumos e grupos financeiros foram criados para parametrizacao do ERP.
- Cadastro de produto deve ficar no modulo Cadastros, nao misturado novamente na pagina `/produtos`.

### Bot Telegram
- Existe estrutura inicial em `/api/bot/telegram` e scripts de webhook.
- Decisao atual: usar parser local simples, sem consumo de tokens de IA.
- O token do bot foi informado pelo usuario em conversa anterior; nao repetir token em respostas e nao commitar tokens.
- O bot ainda precisa ser validado ponta a ponta quando webhook estiver configurado corretamente.

### Padronizacao de APIs e erros
- APIs reais foram padronizadas para responder com formato consistente usando `src/lib/api/responses.ts`.
- Respostas de sucesso usam `apiSuccess`, e erros usam `apiError`, `apiValidationError`, `apiUnauthorized`, `apiForbidden` ou `apiConflict`.
- Frontend passou a usar `src/lib/api-client.ts` em formularios criticos para exibir erro amigavel ao usuario.
- Formularios client-side com submit para API devem preferir o hook `src/lib/hooks/use-api-form.ts`, evitando repetir `loading/error/success`, parse de `FormData`, validacao Zod, `fetchJson` e `router.refresh`.
- Primeira aplicacao do hook foi nos formularios financeiros de contas a pagar, contas a receber, recebimentos e pagamentos.
- A padronizacao foi estendida para Suprimentos: criacao de solicitacao, registro de cotacao/comparativo e conferencia de nota fiscal/recebimento.
- Acoes de Suprimentos tambem foram padronizadas com `fetchJson` e validacao Zod quando aplicavel: editar/excluir solicitacoes, aprovar/reprovar/converter/editar/excluir cotacoes, editar/excluir pedidos e editar/excluir notas fiscais/recebimentos.
- A padronizacao tambem foi iniciada em Produtos e Producao: cadastro de produto, ordem de producao, apontamento e diario de producao usam schemas Zod do backend antes de chamar a API.
- Composicoes/fichas tecnicas tambem passaram a usar `useApiForm`, incluindo criacao e edicao com `POST`/`PATCH`; exclusao usa `fetchJson` para erro padronizado.
- Liberação de lotes em cura usa `useApiForm` e `productionBatchReleaseSchema`; a varredura principal de `fetch(` em Financeiro, Suprimentos, Produtos, Producao e Vendas nao encontrou chamadas manuais restantes.
- Financeiro tem CRUD nas telas de contas a receber e contas a pagar. Exclusao e bloqueada quando a conta a receber veio de venda direta ou possui baixa. Em contas a pagar, Administrador e Diretoria podem excluir titulos mesmo quando vieram de recebimento/NF ou baixa; a exclusao fica registrada em auditoria como acao forcada por perfil.
- Contas a receber possui estorno de baixa financeira: o usuario seleciona a baixa, informa motivo obrigatorio, o sistema remove a baixa, recalcula `receivedAmount`, reabre o status do titulo e registra auditoria do estorno.
- Existe error boundary global em `src/app/error.tsx`.
- `requireApiSession` em `src/lib/auth/guards.ts` tambem usa respostas padronizadas.
- Commit enviado ao GitHub: `70fecb8 Padroniza respostas das APIs e tratamento de erros`.
- Ultimo teste funcional navegou por dashboard, financeiro, contas a receber, contas a pagar, vendas, estoque, suprimentos, producao/diario, produtos, cadastros e usuarios sem runtime error.

## Problemas resolvidos
- `localhost recusou conexao`: servidor local estava desligado; usar `npm.cmd run dev`.
- `spawn EPERM`: Next dev precisou rodar fora do sandbox.
- Erro TLS Prisma/Supabase no Windows: projeto passou a usar `@prisma/adapter-pg` e `pg`.
- Login ficava na tela: ajustado para usar navegacao direta via `window.location.assign`.
- Senha admin perdida: `/setup-admin` agora redefine a senha.
- Layout de Produtos: edicao de composicao nao deve abrir inline; agora usa pagina propria.
- Layout de Produtos: botao `Insumo` na composicao deve adicionar linha visivel na grade.
- Layout de Diario de Producao: formulario e historico nao devem ser comprimidos na mesma linha em telas menores.
- Build no Windows pode falhar com `EPERM` na DLL do Prisma quando o dev server esta rodando. Solucao usada: parar processo Node, rodar `npm.cmd run build`, ajustar `next-env.d.ts` de volta para `.next/dev/types/routes.d.ts` se necessario e religar `npm.cmd run dev`.

## Cuidados
- Nunca commitar `.env`.
- Nao imprimir senha, connection string completa ou tokens em resposta.
- Se mover para outro PC, copiar `.env.example` e recriar `.env` com os valores reais.
- Rodar `npm.cmd install` no novo PC.
- Rodar `npm.cmd run db:generate` se Prisma Client precisar ser regenerado.
- Antes de alterar schema Prisma ou rodar `prisma db push`, confirmar com o usuario se a mudanca pode afetar dados/processos existentes.
- Antes de apagar, resetar, limpar `.next`, parar processos ou mudar configuracoes, explicar o motivo e pedir autorizacao quando houver risco.
- Ha muitas alteracoes acumuladas no worktree. Nao usar `git reset`, `git checkout --` ou comandos destrutivos sem pedido explicito.
- Ao corrigir layout, testar no navegador em largura comum do usuario e verificar ausencia de sobreposicao/overflow horizontal.
- Evitar colocar formulario longo dentro de coluna estreita. Preferir pagina propria, grid responsivo ou tabela com rolagem interna.
- Manter visual corporativo/industrial: fundo claro, cards brancos, bordas suaves, badges, acoes compactas e boa leitura.

## Proximas entregas sugeridas
1. Criar plano tecnico da integracao Focus NFe em homologacao.
2. Criar estrutura fiscal de empresa, clientes e produtos antes da emissao.
3. Criar modulo `Fiscal > NF-e` e tabela de documentos fiscais.
4. Amarrar emissao de NF-e ao fluxo de Venda Direta.
5. Amarrar melhor Produto + Composicao + Producao.
6. Validar consumo automatico de insumos pela ficha tecnica no Diario/Ordem de Producao.
7. Melhorar relatorios de Producao com PDF.
8. Validar fluxo ponta a ponta Suprimentos -> NF -> Estoque -> Contas a pagar.
9. Testar e estabilizar bot Telegram com parser local.
10. Continuar padronizacao UI/UX nas telas restantes.

## Prompt recomendado para nova sessao
Use este texto ao abrir uma nova sessao nesta pasta:

```text
Continue o ERP de pre-moldados nesta pasta. Leia primeiro Memory.md e docs/ESTRATEGIA_UI_UX_ERP.md. Nao apague nada e nao rode comandos que possam prejudicar dados, banco, schema ou configuracoes sem perguntar. Preserve as funcionalidades ja criadas. Estamos evoluindo o MVP real com Next.js, React, Prisma e PostgreSQL/Supabase, corrigindo layouts responsivos e amarrando Produtos + Composicao + Producao.
```
