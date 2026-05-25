# Estrategia UI/UX do ERP Pre-Moldados

## Objetivo

Padronizar as telas do ERP para uso corporativo, com foco em leitura rapida, decisao operacional e baixa poluicao visual.

## Conceito visual

- Cada modulo deve ter cabecalho claro, indicadores resumidos e area de trabalho com cards.
- Tabelas ficam reservadas para dados realmente tabulares; fluxos de decisao usam cards por registro.
- Codigos, valores e documentos usam fonte mono.
- Status, prioridade e decisoes usam badges consistentes.
- Acoes ficam compactas e sempre no mesmo ponto visual do card.

## Padrao por etapa

### Solicitacoes

- Card por solicitacao.
- Destaque para numero, prioridade e status.
- Itens em chips compactos.
- Andamento com quantidade de cotacoes e pedidos.

### Cotacoes

- Lancamento em formulario orientado por solicitacao.
- Mapa comparativo com card por fornecedor.
- Melhor fornecedor destacado por borda, fundo e badge.
- Precos por item em tabela interna, com cor para melhor/intermediario/maior preco.
- Lista e ajustes em cards, mostrando total, frete, entrega e acoes.

### Pedidos

- Card por pedido.
- Destaque para fornecedor, cotacao de origem, total e entrega.
- Itens em chips e indicador de recebimento.
- Acoes compactas; pedido bloqueado apos NF.

### Notas fiscais de compra

- Formulario focado em pedido e NF.
- Itens carregados automaticamente do pedido.
- Ajuste permitido em quantidade e custo unitario.
- Card por recebimento, destacando NF, pedido, deposito, status e valor recebido.

### Produtos e fichas tecnicas

- Card por peca/produto controlado.
- Composicao como ficha tecnica vinculada a uma peca.
- Insumos em linhas internas com quantidade, perda, etapa e saldo disponivel.
- Capacidade estimada destacada no painel lateral da ficha.
- Acoes compactas; ficha tecnica usada em ordem de producao fica travada para edicao/exclusao.

## Regras de espacamento

- Card principal: padding 16 a 18 px.
- Gap entre cards: 14 a 16 px.
- Gap interno: 10 a 12 px.
- Linha de tabela interna: minimo 48 px.
- Badges: 11 px, uppercase.
- Botoes pequenos: 32 a 34 px de altura.
- Border radius: 8 px ou variavel local `--radius`.

## Cores

- Azul institucional: acoes principais e navegacao ativa.
- Verde: aprovado, vencedor, liberado.
- Laranja: urgencia, alerta, divergencia.
- Vermelho: cancelado, reprovado, exclusao.
- Cinzas concretos: fundos tecnicos e areas de apoio.

## Proximas aplicacoes

- Aplicar o mesmo padrao em estoque, financeiro e producao.
- Criar componentes compartilhados para `RecordCard`, `MetaGrid`, `ItemChipList` e `ActionPanel`.
- Reduzir CSS duplicado quando o layout estabilizar.
