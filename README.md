# SimulaLar

Simulador de financiamento imobiliário pelo sistema SAC (Sistema de Amortização Constante). A aplicação exibe a evolução mensal do saldo devedor, prestação, TR projetada, seguros e tarifas.

> Esta é uma simulação matemática independente; não constitui proposta de crédito. Valores de TR, seguros, CET e tarifas reais dependem do contrato e da análise da instituição financeira.

## Requisitos

- Node.js 22.13 ou superior
- pnpm 10 ou superior

## Desenvolvimento

Instale as dependências e inicie o servidor de desenvolvimento:

	pnpm install
	pnpm dev

## Verificações

Antes de enviar alterações, execute:

	pnpm lint
	pnpm test:finance
	pnpm test:coverage
	pnpm build

`test:coverage` exige, no mínimo, 95% de statements e linhas, 85% de branches e 100% de funções no núcleo testado. O workflow de GitHub Pages executa lint, cálculo financeiro com cobertura e build antes do deploy.

## Integração externa com referência de TR

A aplicação consulta a série 226 do Banco Central para obter a Taxa Referencial mais recente usada como base do cenário financeiro. A URL usada é:

	https://api.bcb.gov.br/dados/serie/bcdata.sgs.226/dados/ultimos/1?formato=json

O payload esperado pelo cliente é um array com um único objeto no formato:

	[
	  {
	    "data": "27/08/2026",
	    "dataFim": "27/09/2026",
	    "valor": "0.1692"
	  }
	]

A função de validação aceita apenas valores numéricos finitos, não negativos e até 20% ao mês; datas inválidas ou respostas em formato inesperado disparam a simulação e acionam o fallback interno. Quando a consulta falha ou a resposta não é válida, a aplicação usa a referência local definida em `TR_FALLBACK` e mantém o cálculo operacional sem depender de rede em tempo real.

> A simulação continua sendo independente de proposta de crédito; a API do BCB apenas fornece a referência de taxa para o cenário projetado. Em ambientes sem internet, o fallback local permite que a aplicação continue funcionando com a última referência registrada no código.

## Premissas do cálculo

- A entrada é limitada entre 20% e 100% do valor do imóvel.
- A amortização SAC mensal divide o saldo corrigido pela quantidade de parcelas restantes.
- A TR mensal informada é repetida como projeção nos períodos futuros.
- MIP incide sobre o saldo corrigido; DFI, sobre o valor do imóvel; a tarifa é fixa por mês.
- Os valores são calculados com precisão decimal e arredondados somente na apresentação.
- Vencimentos nos dias 29, 30 ou 31 são ajustados para o último dia quando o mês de destino não tiver esse dia.

## Deploy

Todo push para `main` dispara `.github/workflows/deploy-pages.yml`. O build recebe o caminho base do repositório e publica o conteúdo de `dist` no GitHub Pages.