# Aproveitamento do Google Stitch

## Origem

Arquivo recebido:

`C:\Users\Elisson - Civiltec\Downloads\stitch_erp_industrial_pr_moldados.zip`

Extraido localmente apenas como referencia em:

`stitch-reference/`

Essa pasta nao deve ser commitada. Ela foi adicionada ao `.gitignore`.

## Diretriz principal

O material do Stitch deve ser usado como referencia visual, nao como substituicao direta do ERP.

Preservar sempre:

- rotas existentes;
- autenticacao;
- regras de permissao;
- APIs;
- Prisma/PostgreSQL/Supabase;
- fluxo real de suprimentos, estoque, financeiro e producao;
- componentes funcionais ja criados.

## Parte boa para aproveitar

### Design system recomendado

Usar como base o conceito **Industrial Modern ERP**, principalmente a versao com:

- azul institucional `#000666` / `#1A237E`;
- fundo claro `#F9F9F9`;
- cards brancos;
- bordas cinza concreto `#E2E2E2` / `#C6C5D4`;
- laranja construcao `#FA6D00` para alertas e producao ativa;
- vermelho `#BA1A1A` para erro/exclusao;
- IBM Plex Sans para titulos;
- Inter para textos de interface;
- JetBrains Mono para codigos, numeros e documentos.

### Componentes bons

Extrair os seguintes padroes:

- sidebar e topbar mais limpas;
- cards com barra/acento lateral por status;
- botoes retos com radius baixo, sem visual muito arredondado;
- badges pequenos e retangulares;
- tabelas com cabecalho forte e rolagem horizontal interna;
- metric cards com icone, valor e texto auxiliar;
- formularios com labels sempre visiveis;
- layout mobile/tablet com navegacao inferior e cards empilhados;
- campos com altura constante e foco azul.

### Telas mais aproveitaveis

Prioridade de referencia:

1. `produ_o_refinado`
2. `produtos_refinado_1` e `produtos_refinado_2`
3. `suprimentos_tablet_refinado_5`
4. `gest_o_de_estoque_refinado`
5. `financeiro_refinado`
6. `cadastros_base_refinado`
7. `usu_rios_e_perfis_refinado_1`

Essas telas tem bons padroes de densidade, cards, metricas e organizacao.

## Parte que deve ser descartada

Nao copiar diretamente:

- paginas quebradas ou screenshots vazios;
- HTML inteiro gerado pelo Stitch;
- Tailwind CDN dentro do ERP;
- Material Symbols como dependencia principal, pois o ERP usa lucide-react;
- temas organicos como `terra`, pois nao combinam com o ERP industrial;
- layouts que comprimem formularios em colunas estreitas;
- layouts que misturam tudo em uma unica tela quando o modulo ja foi separado por paginas.

## Regras para aplicar no ERP

1. Aplicar por tela, nunca trocar o sistema inteiro de uma vez.
2. Antes de alterar uma tela, identificar qual parte do Stitch sera aproveitada.
3. Manter a regra de negocio intacta.
4. Evitar formularios longos dentro de cards estreitos.
5. Preferir pagina propria para edicoes complexas.
6. Tabelas grandes devem ter rolagem interna, nao estourar a pagina.
7. Testar no navegador em 100% de zoom apos qualquer mudanca visual.
8. Verificar se nao existe sobreposicao, texto cortado ou overflow horizontal.

## Aplicacao sugerida

### Primeiro ciclo

Aplicar os padroes do Stitch em:

- `/producao/diario`
- `/produtos`
- `/produtos/composicoes/nova`
- `/produtos/composicoes/[id]/editar`

Motivo: sao telas que o usuario esta ajustando agora e que precisam de melhor responsividade.

### Segundo ciclo

Aplicar em:

- `/suprimentos/solicitacoes`
- `/suprimentos/cotacoes`
- `/suprimentos/pedidos`
- `/suprimentos/notas-fiscais`
- `/suprimentos/relatorios`

Motivo: sao fluxos densos, com tabelas e comparativos.

### Terceiro ciclo

Aplicar em:

- `/estoque`
- `/financeiro`
- `/financeiro/contas-pagar`
- `/financeiro/contas-receber`
- `/usuarios`
- `/cadastros`

## Prompt para continuar depois

```text
Use docs/STITCH_APROVEITAMENTO.md como referencia. Aproveite apenas os bons padroes do Google Stitch: cores industriais, cards, tabelas, badges, formularios e responsividade. Nao copie HTML inteiro, nao troque regras de negocio e nao altere backend. Aplique por tela e teste no navegador.
```
