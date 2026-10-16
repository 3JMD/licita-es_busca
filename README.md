# Licitações PNCP

Página simples para consultar a API pública do PNCP (Portal Nacional de Contratações Públicas):

- **Abertas**: contratações recebendo propostas, com encerramento até uma data.
- **Publicadas no período / encerradas**: tudo que foi publicado entre duas datas, com status calculado (Aberta / Encerrada / Revogada…).

- **Busca por palavra-chave**: procura no texto dos editais de todo o PNCP (busca do próprio portal, direto do navegador).

Filtros: UF, modalidade, tamanho de página; município, valor mín./máx., texto livre e "só registro de preços (SRP)" (na página atual). Os cabeçalhos Valor, Publicação e Encerramento ordenam a tabela; prazos de menos de 3 dias aparecem em vermelho. O botão **Detalhes** mostra itens (com o benefício ME/EPP de cada um) e documentos do edital. ☆/★ salva o edital nos **Favoritos**. A busca fica na URL (compartilhável). Na aba de palavra-chave há atalhos do pacote Saúde. Exporta a página atual em CSV (separador `;`, abre direto no Excel).

## Estrutura

```
index.html            # markup e estilos
app.js                # abas, filtros, tabela, favoritos, monitoramentos
preco.js              # aba Preço de referência (item único, lista e cache)
dom.js, favoritos.js  # utilidades de DOM/formatação e armazenamento de favoritos
lib/pncp.mjs          # acesso à API do PNCP, normalização e cálculo de preços (site e Actions)
api/pncp.js           # função serverless da Vercel que chama o PNCP (abas Abertas/Publicadas)
alerts.json           # termos dos alertas e do cache de destaques
itens.json            # itens do cache de preços (até 10)
scripts/              # alertas.mjs, precos.mjs e testes (node scripts/alertas.test.mjs)
data/                 # destaques.json e precos.json, gerados pela Action
.github/workflows/    # Action diária (08:00 BRT)
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

## Destaques (cache diário)

A aba inicial lê `data/destaques.json`, gerado pela mesma Action dos alertas: todos os editais abertos dos termos de `alerts.json` (50 mais recentes por termo), com "Novo" para o que saiu nas últimas 25 h. Abre instantaneamente e funciona com o PNCP fora do ar; a lista esconde o que já encerrou entre uma atualização e outra. Se a consulta de um termo falhar na rodada, as linhas dele do cache anterior são mantidas. A Action faz commit do arquivo, e a Vercel republica sozinha.

## Meus monitoramentos

Aba onde cada pessoa cadastra até 5 termos (com UF opcional). Ficam salvos no próprio navegador (`localStorage`), sem login nem servidor. Ao abrir a aba, o site consulta o PNCP e marca "Novo" o que foi publicado desde a última visita. Não avisa quem não abrir o site; para aviso por e-mail use os alertas abaixo.

## Preço de referência

Digite um item (ex.: "dipirona sódica 500 mg") e o site busca as 15 atas de registro de preços mais recentes, abre os itens homologados que contêm todas as palavras e lista valor unitário, quantidade, fornecedor e órgão, com mínimo/mediana/média/máximo **por unidade de medida**. Exporta CSV. Itens de `itens.json` abrem do cache diário (`data/precos.json`); "Atualizar ao vivo" consulta o PNCP na hora. Há também a pesquisa **em lista** (até 20 itens, um por linha) com planilha de mediana e menor preço por item. Limitações: só vê os 50 primeiros itens de cada compra; a busca por texto é aproximada, então confira descrição e apresentação antes de usar o preço; leva alguns segundos porque cada ata exige várias chamadas ao PNCP.

## Alertas diários

Edite `alerts.json` (`termo` e, opcional, `ufs`). Todo dia às 08:00 (Brasília) uma GitHub Action busca editais **abertos publicados nas últimas 25 h** e abre uma Issue com a lista; o GitHub avisa por e-mail quem acompanha o repositório (Watch → All Activity ou Issues). Rodar na hora: aba Actions → *Alertas de licitações* → Run workflow. A Issue agrupa por UF, destaca o que encerra em menos de 5 dias e fecha a Issue anterior. Se a Action falhar, ela abre uma Issue "Falha na Action de alertas" (e a fecha quando voltar a funcionar). Local: `DRY_RUN=1 node scripts/alertas.mjs`; teste: `node scripts/alertas.test.mjs`.

A busca do PNCP é aproximada: termos genéricos trazem resultado vagamente relacionado. A descrição da busca vem truncada pelo PNCP. O valor estimado quase nunca vem na busca por palavra-chave, então o filtro de valor esconde esses registros.
