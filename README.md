# Licitações PNCP

Página simples para consultar a API pública do PNCP (Portal Nacional de Contratações Públicas):

- **Abertas**: contratações recebendo propostas, com encerramento até uma data.
- **Publicadas no período / encerradas**: tudo que foi publicado entre duas datas, com status calculado (Aberta / Encerrada / Revogada…).

- **Busca por palavra-chave**: procura no texto dos editais de todo o PNCP (busca do próprio portal, direto do navegador).

Filtros: UF, modalidade, tamanho de página; município, valor mín./máx. e texto livre (na página atual). O botão **Detalhes** mostra itens e documentos do edital. A busca fica na URL (compartilhável). Exporta a página atual em CSV (separador `;`, abre direto no Excel).

## Estrutura

```
index.html      # front-end (HTML + JS puro, sem dependências)
alerts.json     # termos monitorados pelos alertas
scripts/alertas.mjs  # consulta diária e abre uma Issue com o que saiu de novo
.github/workflows/alertas.yml  # agenda (08:00 BRT) e roda o script
api/pncp.js     # função serverless da Vercel que chama o PNCP (evita CORS)
vercel.json     # timeout da função (30 s)
package.json
```

## Deploy

1. Crie um repositório no GitHub e suba estes arquivos.
2. Na Vercel: **Add New → Project → Import** o repositório. Framework preset: **Other**. Sem build command.
3. Deploy. A página fica na raiz, e a API em `/api/pncp`.

Para rodar localmente: `npx vercel dev` (abrir `index.html` direto no navegador não funciona, porque a página chama `/api/pncp`).

## API interna

`GET /api/pncp?tipo=abertas&dataFinal=20261031&uf=SP&modalidade=6&pagina=1&tamanhoPagina=20`

`GET /api/pncp?tipo=publicadas&dataInicial=20261001&dataFinal=20261007&pagina=1`

## Limitações conhecidas

- O endpoint `/publicacao` do PNCP **exige modalidade**. Com "Todas", a função faz 13 chamadas em paralelo e junta a página N de cada uma. O total de registros é a soma, e o total de páginas é o da maior modalidade.
- "Filtrar texto" e "Só encerradas" filtram **apenas a página carregada**. A API do PNCP não tem busca por palavra-chave.
- O PNCP não cobre tudo: estatais (Lei 13.303), parte dos municípios pequenos e processos antigos (Lei 8.666) podem estar ausentes.
- A API pública pode ficar instável ou limitar requisições. Erros aparecem na tela.

## Meus monitoramentos

Aba onde cada pessoa cadastra até 5 termos (com UF opcional). Ficam salvos no próprio navegador (`localStorage`), sem login nem servidor. Ao abrir a aba, o site consulta o PNCP e marca "Novo" o que foi publicado desde a última visita. Não avisa quem não abrir o site; para aviso por e-mail use os alertas abaixo.

## Alertas diários

Edite `alerts.json` (`termo` e, opcional, `ufs`). Todo dia às 08:00 (Brasília) uma GitHub Action busca editais **abertos publicados nas últimas 25 h** e abre uma Issue com a lista; o GitHub avisa por e-mail quem acompanha o repositório (Watch → All Activity ou Issues). Rodar na hora: aba Actions → *Alertas de licitações* → Run workflow. Local: `DRY_RUN=1 node scripts/alertas.mjs`; teste: `node scripts/alertas.test.mjs`.

A busca do PNCP é aproximada: termos genéricos trazem resultado vagamente relacionado. A descrição da busca vem truncada pelo PNCP. O valor estimado quase nunca vem na busca por palavra-chave, então o filtro de valor esconde esses registros.
