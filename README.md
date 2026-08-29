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

## Amortizações extraordinárias

Além do boleto mensal (SAC + TR + seguros + tarifa), a simulação aceita duas amortizações extraordinárias opcionais, aplicadas **na mesma ordem, todo mês**:

1. **Boleto** — SAC padrão: `amort = saldoCorrigido ÷ parcelasRestantes`; `saldo -= amort`; `parcelasRestantes -= 1`.
2. **Amortização extra mensal** (`payLastInstallmentMonthly`) — paga o valor da última parcela *do cronograma vigente* e a retira do prazo. Como esse valor depende das parcelas restantes, que por sua vez dependem do saldo já reduzido pelo boleto do mês, ele é recalculado a cada mês por uma fórmula fechada (sem simular o restante do contrato):

> extra = saldo × (1 + TR)^parcelasRestantes ÷ parcelasRestantes × (1 + jurosMensal)

Em seguida `saldo -= extra` e `parcelasRestantes -= 1` novamente. Por retirar 2 parcelas do prazo a cada mês em que está ativa (1 do boleto + 1 da extra), essa opção reduz o prazo contratado praticamente à metade, com o valor do boleto tendendo a ficar estável ao longo do tempo. Em cenário sem TR e sem juros, a prova é direta: `extra` iguala `amort` todo mês, então o saldo cai duas vezes mais rápido e o contrato de N meses quita em `⌈N/2⌉` meses.
3. **Amortização extraordinária via FGTS** — a cada 24 meses (`FGTS_AMORTIZATION_INTERVAL_MONTHS`), o saldo acumulado de FGTS (aportes mensais + rendimento) abate o saldo devedor **depois** do boleto e da amortização extra do mês, sem retirar parcelas do prazo diretamente. Se o valor acumulado for suficiente para zerar o saldo remanescente, o financiamento é liquidado naquele mês (a quitação antecipada só ocorre nesse cenário — combinar FGTS com a amortização extra mensal reduz o valor das parcelas restantes, mas não acelera o prazo além do que a amortização extra já provoca, a menos que o FGTS zere o saldo antes disso).

Como o saldo é atualizado sequencialmente (boleto → extra → FGTS), os juros e o MIP de cada mês incidem sobre o saldo corrigido **antes** de qualquer amortização extraordinária; apenas o saldo do mês seguinte reflete a redução.


### Eliminação de circularidade em amortizações extraordinárias mensais

No SAC com TR, se o saldo após o boleto é *B* e restam *r* parcelas, a última parcela projetada tem valor exato:

```math
	P_{\text{última}} = \frac{B \cdot (1+TR)^r}{r} \cdot (1 + j)
```
Isso elimina a circularidade sem precisar re-simular o cronograma inteiro a cada mês.

## Deploy

Todo push para `main` dispara `.github/workflows/deploy-pages.yml`. O build define `NEXT_PUBLIC_BASE_PATH` com o caminho do repositório (por exemplo `/buy-or-rent`), o que aplica o `assetPrefix` do `next.config.mjs` ao CSS, aos chunks JS e aos arquivos de `public/`. Em seguida, as rotas estáticas são pré-renderizadas e o artefato é montado em `dist/pages` (HTML de `dist/server/prerendered-routes`, assets de `dist/client/<repo>/_next`) e publicado no GitHub Pages.