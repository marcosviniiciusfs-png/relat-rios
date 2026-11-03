# Relatório Semanal Hurtz

Transforma o export do Gerenciador de Anúncios (.xlsx/.csv) na imagem "Relatório de Performance" (1920x1080) enviada ao cliente. Cruza dados de atendimento quando existirem.

## Uso rápido (site)

1. Duplo clique em `iniciar.cmd` (ou `node server.js`) e abra http://localhost:5174.
2. Solte as planilhas (uma por cliente, várias de uma vez funciona).
3. Confira o cliente, os grupos de campanha e os textos. Tudo é editável e a prévia atualiza na hora.
4. `Baixar PNG`, `Copiar imagem` (cola direto no WhatsApp) ou `Baixar todos (.zip)`.
5. `Salvar config do cliente` guarda grupos, papéis dos indicadores e layout de atendimento em `config/clientes.json` (versionado). Na semana seguinte o cliente já abre pronto.

## Planilha

Export de campanhas do Gerenciador de Anúncios com as colunas padrão: Nome da campanha, Resultados, Indicador de resultados, Custo por resultados, Valor gasto (BRL), Impressões, Alcance e as datas. Nada de ajuste manual na planilha.

| Indicador do Meta | Vira |
|---|---|
| conversas iniciadas (mensagens) | resultado principal (Conversas) |
| lead de formulário | resultado principal (Leads) |
| visita ao perfil, clique no link, visita à página, vídeo | "Outros resultados" (não soma nos resultados) |

Custo por resultado = gasto das campanhas de resultado principal / resultados. "Valor gasto" soma todas as campanhas.
Dá para trocar o papel de qualquer indicador no editor (Resultado principal, Outro resultado, Ignorar).

## Atendimento (cruzamento)

Cole na seção "Atendimento" uma tabela com a 1ª linha de dias e a 1ª coluna com os indicadores:

```
Dia	19/10	20/10	21/10	22/10	23/10
Pacientes	13	17	22	12	14
Consultas	3	2	4	3	6
```

O 4º cartão vira "Atendimento" com os totais, a tabela por dia entra no painel da direita e dá para definir uma taxa (ex.: Consultas / pacientes). O relatório sempre avisa que não há vínculo individual com os anúncios.

## CLI (para o Claude e para lote)

```bash
node gerar.js --planilha "C:/.../CA--Dr-Alexia-Lima-Campanhas-....xlsx" --saida relatorios
node gerar.js --planilha a.xlsx --planilha b.xlsx --saida relatorios
node gerar.js --planilha a.xlsx --atendimento atendimento.tsv --ajustes ajustes.json
node gerar.js --planilha a.xlsx --so-resumo     # só imprime os números e textos, sem gerar PNG
```

Imprime um JSON com totais, grupos, campanhas sem resultado e textos. `ajustes.json` aceita `cfg`, `attLayout` e `texts` (ver cabeçalho de `gerar.js`).

## Requisitos

Node 18+ e Chrome ou Edge instalado. Na primeira vez: `npm install` (o `iniciar.cmd` já faz). O site em si não precisa de nada além do Node.

## Arquivos

- `public/core.js`: leitura da planilha, grupos, métricas e textos automáticos
- `public/report.js` + `report.css`: desenho do relatório
- `public/app.js`: interface
- `server.js`: servidor local e persistência da configuração
- `gerar.js`: CLI

## Publicação automática

Todo push na `main` publica `public/` em https://akash-relatorios.pages.dev via GitHub Actions (`.github/workflows/deploy.yml`).
Secrets necessários no repositório: `CLOUDFLARE_API_TOKEN` (permissão Cloudflare Pages: Edit) e `CLOUDFLARE_ACCOUNT_ID`.
