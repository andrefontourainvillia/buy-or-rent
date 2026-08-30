'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { assetPath } from './asset-path';
import {
  calculateSchedule,
  clampFgtsToEntry,
  compareRentVsBuy,
  computeFgtsMonthlyRate,
  entryFromPercent,
  ENTRY_PERCENT_MAX,
  ENTRY_PERCENT_MIN,
  entryPercentFromAmount,
  fetchTrReference,
  FGTS_AMORTIZATION_INTERVAL_MONTHS,
  formatFinancingPeriod,
  formatFinancingPeriodWithMonths,
  normalizeEntryAmount,
  shouldApplyAutomaticTr,
  TR_API_URL,
  TR_FALLBACK,
} from './financing';
import type { ScheduleRow } from './financing';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const trNumber = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const fmt = (value: number) => money.format(Number.isFinite(value) ? value : 0);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const TOOLTIP_COPY = {
  property: 'Preço total do imóvel usado como base para calcular a entrada, o financiamento e o seguro DFI.',
  down: 'Valor pago com recursos próprios. É subtraído do valor do imóvel para encontrar o valor financiado.',
  downPercent: 'Valor da entrada ÷ valor do imóvel × 100. Ao alterar este percentual, a entrada em reais é recalculada.',
  months: 'Quantidade de parcelas mensais. No SAC, o saldo corrigido é dividido pelas parcelas restantes.',
  annualRate: 'Taxa nominal anual do contrato. Para os juros mensais, o simulador divide essa taxa por 12.',
  firstDue: 'Data da primeira parcela. Os vencimentos seguintes avançam um mês por linha.',
  trProjected: 'Taxa Referencial mensal aplicada ao saldo anterior. A taxa ativa é repetida apenas como cenário projetado.',
  mipRate: 'Seguro por morte ou invalidez permanente. Calculado mensalmente sobre o saldo corrigido.',
  dfiRate: 'Seguro de danos físicos ao imóvel. Calculado mensalmente sobre o valor do imóvel.',
  fee: 'Valor administrativo fixo somado ao boleto de cada mês.',
  installmentNumber: 'Ordem da parcela dentro do prazo contratado.',
  dueDate: 'Data estimada de vencimento da parcela.',
  openingBalance: 'Saldo devedor deixado pela parcela anterior, antes da correção monetária do mês.',
  trCorrection: 'Saldo anterior × TR mensal projetada.',
  correctedBalance: 'Saldo anterior + correção pela TR.',
  amortization: 'Saldo corrigido ÷ quantidade de parcelas restantes.',
  interest: 'Saldo corrigido × taxa nominal mensal de juros.',
  payment: 'Amortização + juros. Seguros e tarifa não fazem parte da prestação.',
  mip: 'Saldo corrigido × taxa mensal do seguro MIP.',
  dfi: 'Valor do imóvel × taxa mensal do seguro DFI.',
  monthlyFee: 'Tarifa administrativa fixa informada no cenário.',
  boleto: 'Prestação + MIP + DFI + tarifa administrativa.',
  realAmortization: 'Saldo anterior − saldo devedor final. Mostra a redução líquida da dívida após a correção pela TR; um valor negativo indica aumento do saldo no mês.',
  endingBalance: 'Saldo corrigido − amortização. Este valor inicia o cálculo do mês seguinte.',
  fgtsEnable: 'Usa o saldo atual do FGTS para compor a entrada informada acima, sem alterar o valor total da entrada.',
  fgtsBalance: 'Saldo disponível do FGTS hoje. É abatido da entrada informada, reduzindo o valor pago com recursos próprios.',
  fgtsYield: `Rendimento legal do FGTS: TR do período + 3% a.a. (0,25% a.m. linear). Calculado a partir da TR informada, mas pode ser editado manualmente.`,
  fgtsAmortizationEnable: `Usa o saldo acumulado de FGTS (aportes mensais + rendimento) para abater o saldo devedor a cada ${FGTS_AMORTIZATION_INTERVAL_MONTHS} meses.`,
  fgtsContribution: 'Valor mensal depositado no FGTS (tende a acompanhar 8% do salário). Some mês a mês até a próxima amortização extraordinária.',
  fgtsRaise: 'Reajuste anual aplicado ao aporte mensal, simulando aumentos salariais futuros.',
  fgtsDepositColumn: 'Valor depositado no FGTS no mês correspondente, considerando os reajustes anuais programados.',
  fgtsBalanceColumn: 'Saldo acumulado na conta do FGTS após o rendimento mensal e o depósito do mês, descontando amortizações extraordinárias realizadas.',
  fgtsAmortizationColumn: `Saldo de FGTS acumulado (aportes + rendimento) aplicado como amortização extraordinária a cada ${FGTS_AMORTIZATION_INTERVAL_MONTHS} meses.`,
  ownTotalColumn: 'Soma acumulada da entrada com recursos próprios e de todos os boletos pagos até esta parcela, sem contar valores de FGTS.',
  fgtsTotalColumn: 'Soma acumulada da entrada e das amortizações extraordinárias pagas com FGTS até esta parcela.',
  grandTotalColumn: 'Total boletos + Total FGTS: soma de todos os valores desembolsados até esta parcela, com e sem FGTS.',
  extraAmortizationEnable: 'Além do boleto, paga todo mês o valor da última parcela do cronograma vigente, retirando-a do prazo. O valor é recalculado a cada mês, pois cada amortização reduz o saldo devedor e muda a última parcela.',
  extraAmortizationColumn: 'Valor pago no mês para quitar a última parcela do cronograma vigente. Recalculado mensalmente: saldo após o boleto, corrigido pela TR até o fim do prazo, dividido pelas parcelas restantes, acrescido dos juros.',
  extraAmortizationTotalColumn: 'Soma acumulada da amortização extra mensal paga até esta parcela.',
  compareEnable: 'Ativa o comparativo entre financiar e alugar: adiciona colunas do cenário do locatário à tabela e o painel de patrimônio no horizonte.',
  compareRent: 'Aluguel mensal de um imóvel equivalente. É o que o locatário paga em vez do boleto do financiamento.',
  compareRentRaise: 'Reajuste anual do aluguel, aplicado em degraus a cada 12 meses.',
  compareHorizon: 'Quantidade de meses simulados na comparação entre comprar e alugar.',
  compareInvestReal: 'Retorno real (acima da inflação) da carteira onde o locatário investe a entrada e a diferença mensal.',
  compareIpca: 'Inflação projetada, composta com o retorno real para obter o rendimento nominal da carteira: (1 + real) × (1 + IPCA) − 1.',
  compareDoc: 'ITBI e cartório/escritura, em % do imóvel. O comprador paga na aquisição sem abater o saldo devedor; o locatário mantém esse valor investido.',
  compareFgtsContribution: 'Depósito mensal de FGTS (tende a acompanhar 8% do salário CLT), idêntico nos dois cenários.',
  compareFgtsRaise: 'Reajuste anual do depósito mensal de FGTS, simulando aumentos salariais.',
  compareScenario: 'Valorização anual do imóvel usada para projetar o patrimônio do comprador neste cenário.',
  compareRenterNetWorth: 'Carteira de investimentos + FGTS acumulado do locatário ao final do horizonte.',
  comparePortfolio: 'Entrada própria + documentação investidas desde o início, rendendo a taxa nominal e somando (ou consumindo) a diferença entre boleto e aluguel todo mês.',
  compareRenterFgts: 'FGTS do locatário: saldo atual mantido + depósitos mensais, rendendo a taxa da seção FGTS.',
  compareDebt: 'Saldo devedor do financiamento no último mês do horizonte.',
  compareBuyerFgts: 'FGTS do comprador no horizonte: sobra não usada na entrada + depósitos, descontando amortizações extraordinárias já aplicadas.',
  compareResidualDebt: 'Máximo entre zero e saldo devedor − FGTS do comprador: dívida restante após quitar com o FGTS acumulado.',
  compareTotalRent: 'Soma dos aluguéis pagos no horizonte.',
  compareTotalBuyer: 'Soma dos boletos e amortizações extras mensais pagos pelo comprador no horizonte.',
  compareBreakeven: 'Valorização anual do imóvel necessária para o patrimônio do comprador igualar o do locatário no fim do horizonte.',
  rentColumn: 'Aluguel projetado do mês, com o reajuste anual aplicado em degraus a cada 12 meses.',
  investedDifferenceColumn: 'Boleto + amortização extra − aluguel do mês. Positivo é o que o locatário investe; negativo indica retirada da carteira.',
  renterPortfolioColumn: 'Carteira do locatário após o rendimento nominal do mês e o aporte (ou retirada) da diferença entre boleto e aluguel.',
  renterFgtsColumn: 'FGTS acumulado do locatário após o rendimento e o depósito do mês.',
  renterNetWorthColumn: 'Carteira investida + FGTS do locatário ao final do mês.',
} as const;

type TrSource = { kind: 'loading' | 'bcb' | 'fallback' | 'manual'; startDate?: string; endDate?: string };

const SCENARIO_LABELS = ['Conservador', 'Central', 'Otimista'];

function EvolutionChart({ rows, termLabel }: { rows: ScheduleRow[]; termLabel: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !rows.length) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const box = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = box.width * dpr;
    canvas.height = box.height * dpr;
    context.scale(dpr, dpr);
    const width = box.width;
    const height = box.height;
    const padding = { left: 24, right: 18, top: 20, bottom: 28 };
    const maximumBoleto = Math.max(rows[0].total, 1);
    context.clearRect(0, 0, width, height);
    context.strokeStyle = '#d9e4e7';
    context.lineWidth = 1;
    [0, 0.5, 1].forEach((position) => {
      const y = padding.top + (height - padding.top - padding.bottom) * position;
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(width - padding.right, y);
      context.stroke();
    });
    const drawLine = (key: 'total' | 'balance', color: string, scale: number) => {
      context.strokeStyle = color;
      context.lineWidth = 3;
      context.lineJoin = 'round';
      context.beginPath();
      rows.forEach((row, index) => {
        const x = padding.left + (index / (rows.length - 1 || 1)) * (width - padding.left - padding.right);
        const y = padding.top + (1 - row[key] / scale) * (height - padding.top - padding.bottom);
        if (index) context.lineTo(x, y);
        else context.moveTo(x, y);
      });
      context.stroke();
    };
    drawLine('total', '#e8890c', maximumBoleto);
    drawLine('balance', '#0875b9', Math.max(rows[0].balance, 1));
    context.fillStyle = '#78909c';
    context.font = '11px Arial';
    context.fillText('início', padding.left, height - 8);
    context.textAlign = 'right';
    context.fillText(termLabel, width - padding.right, height - 8);
    context.textAlign = 'left';
  }, [rows, termLabel]);

  return <canvas ref={ref} className="chart" aria-label="Gráfico da queda do boleto e do saldo devedor ao longo do prazo" />;
}

export default function Home() {
  const [property, setProperty] = useState(650000);
  const [down, setDown] = useState(130000);
  const [months, setMonths] = useState(420);
  const [rate, setRate] = useState(10.74);
  const [tr, setTr] = useState(TR_FALLBACK.monthlyPercent);
  const [mipRate, setMipRate] = useState(0.01536);
  const [dfiRate, setDfiRate] = useState(0.013);
  const [fee, setFee] = useState(25);
  const [firstDue, setFirstDue] = useState('2026-09-28');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showTableDetails, setShowTableDetails] = useState(false);
  const [showFgtsDetails, setShowFgtsDetails] = useState(false);
  const [showTotals, setShowTotals] = useState(false);
  const [trSource, setTrSource] = useState<TrSource>({ kind: 'loading', startDate: TR_FALLBACK.startDate, endDate: TR_FALLBACK.endDate });
  const trWasEdited = useRef(false);
  const [fgtsEnabled, setFgtsEnabled] = useState(false);
  const [fgtsBalance, setFgtsBalance] = useState(0);
  const [fgtsYieldOverride, setFgtsYieldOverride] = useState<number | null>(null);
  const [fgtsAmortizationEnabled, setFgtsAmortizationEnabled] = useState(false);
  const [fgtsContribution, setFgtsContribution] = useState(300);
  const [fgtsRaise, setFgtsRaise] = useState(5);
  const [extraAmortizationEnabled, setExtraAmortizationEnabled] = useState(false);
  const [rentComparisonEnabled, setRentComparisonEnabled] = useState(false);
  const [showRentDetails, setShowRentDetails] = useState(false);
  const [rentValue, setRentValue] = useState(3500);
  const [rentRaise, setRentRaise] = useState(7);
  const [compareHorizon, setCompareHorizon] = useState(120);
  const [investReal, setInvestReal] = useState(6);
  const [ipca, setIpca] = useState(4.5);
  const [docPercent, setDocPercent] = useState(4.5);
  const [compareFgtsContribution, setCompareFgtsContribution] = useState(0);
  const [compareFgtsRaise, setCompareFgtsRaise] = useState(5);
  const [scenarioConservative, setScenarioConservative] = useState(3);
  const [scenarioCentral, setScenarioCentral] = useState(5);
  const [scenarioOptimistic, setScenarioOptimistic] = useState(7);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    fetchTrReference((input, init) => fetch(input, { ...init, signal: controller.signal }), { headers: { Accept: 'application/json' } })
      .then((result) => {
        if (!active || !shouldApplyAutomaticTr(trWasEdited.current)) return;

        if (result.source === 'bcb' && result.reference) {
          setTr(result.reference.monthlyPercent);
          setTrSource({ kind: 'bcb', startDate: result.reference.startDate, endDate: result.reference.endDate });
          return;
        }

        console.warn('Consulta da TR indisponível; usando referência local.');
        setTrSource({ kind: 'fallback', startDate: TR_FALLBACK.startDate, endDate: TR_FALLBACK.endDate });
      })
      .catch((error) => {
        if (!active || controller.signal.aborted || !shouldApplyAutomaticTr(trWasEdited.current)) return;
        console.warn('Consulta da TR indisponível; usando referência local.', error);
        setTrSource({ kind: 'fallback', startDate: TR_FALLBACK.startDate, endDate: TR_FALLBACK.endDate });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const updateTr = (value: number) => {
    trWasEdited.current = true;
    setTr(value);
    setTrSource({ kind: 'manual' });
  };

  const fgtsYield = fgtsYieldOverride ?? computeFgtsMonthlyRate(tr);
  const fgtsAmortizationActive = fgtsEnabled && fgtsAmortizationEnabled;
  const updateFgtsYield = (value: number) => setFgtsYieldOverride(value);

  const downPercent = entryPercentFromAmount(property, down);
  const minimumDown = entryFromPercent(property, ENTRY_PERCENT_MIN);
  const updateProperty = (value: number) => {
    setProperty(value);
    setDown(entryFromPercent(value, downPercent));
  };
  const updateDown = (value: number) => setDown(normalizeEntryAmount(property, value));
  const updateDownPercent = (value: number) => setDown(entryFromPercent(property, value));

  const financingInputs = useMemo(() => ({
    property,
    down,
    months,
    annualNominalRate: rate,
    trMonthlyPercent: tr,
    mipMonthlyPercent: mipRate,
    dfiMonthlyPercent: dfiRate,
    monthlyFee: fee,
    firstDue,
    fgts: fgtsEnabled ? {
      currentBalance: fgtsBalance,
      monthlyYieldPercent: fgtsYield,
      extraordinaryAmortization: fgtsAmortizationActive ? { monthlyContribution: fgtsContribution, annualRaisePercent: fgtsRaise } : undefined,
    } : undefined,
    extraAmortization: extraAmortizationEnabled ? { payLastInstallmentMonthly: true } : undefined,
  }), [property, down, months, rate, tr, mipRate, dfiRate, fee, firstDue, fgtsEnabled, fgtsBalance, fgtsYield, fgtsAmortizationActive, fgtsContribution, fgtsRaise, extraAmortizationEnabled]);
  const result = useMemo(() => calculateSchedule(financingInputs), [financingInputs]);
  const comparison = useMemo(() => compareRentVsBuy(financingInputs, {
    horizonMonths: compareHorizon,
    initialRent: rentValue,
    rentAnnualAdjustPercent: rentRaise,
    investmentAnnualRealPercent: investReal,
    ipcaAnnualPercent: ipca,
    documentationPercent: docPercent,
    fgtsMonthlyYieldPercent: fgtsYield,
    fgtsMonthlyContribution: fgtsAmortizationActive ? fgtsContribution : compareFgtsContribution,
    fgtsAnnualRaisePercent: fgtsAmortizationActive ? fgtsRaise : compareFgtsRaise,
    appreciationScenariosAnnualPercent: [scenarioConservative, scenarioCentral, scenarioOptimistic],
  }), [financingInputs, compareHorizon, rentValue, rentRaise, investReal, ipca, docPercent, fgtsYield, fgtsAmortizationActive, fgtsContribution, fgtsRaise, compareFgtsContribution, compareFgtsRaise, scenarioConservative, scenarioCentral, scenarioOptimistic]);
  const first = result.rows[0];
  const last = result.rows.at(-1);
  const extraAmortizationFirstAmount = first?.extraAmortization ?? 0;
  const fgtsEntryPortion = fgtsEnabled ? clampFgtsToEntry(result.entry, fgtsBalance) : 0;
  const anticipatedMonths = (fgtsAmortizationActive || extraAmortizationEnabled) ? months - result.term : 0;
  const hasFgtsEntryPortion = fgtsEntryPortion > 0;
  const hasRecalculatedTerm = anticipatedMonths > 0;
  const termLabel = formatFinancingPeriodWithMonths(result.term);
  const trStatus = trSource.kind === 'bcb'
    ? `Banco Central • ${trSource.startDate} a ${trSource.endDate}`
    : trSource.kind === 'manual'
      ? 'Cenário manual'
      : trSource.kind === 'loading'
        ? 'Consultando a referência mais recente no Banco Central…'
        : `Referência local • ${trSource.startDate} a ${trSource.endDate}`;

  const resultHelp = useMemo(() => ({
    financed: `${fmt(result.price)} − ${fmt(result.entry)} = ${fmt(result.financed)}.`,
    activeTr: `${trStatus}. ${fmt(first?.openingBalance || 0)} × ${trNumber.format(tr)}% = ${fmt(first?.correction || 0)} de correção na primeira parcela. A taxa mensal ativa é repetida nos meses futuros apenas como projeção.`,
    firstBoleto: first ? `Prestação ${fmt(first.payment)} + MIP ${fmt(first.mip)} + DFI ${fmt(first.dfi)} + tarifa ${fmt(first.fee)} = ${fmt(first.total)}.` : '',
    lastBoleto: last ? `Prestação ${fmt(last.payment)} + MIP ${fmt(last.mip)} + DFI ${fmt(last.dfi)} + tarifa ${fmt(last.fee)} = ${fmt(last.total)}.` : '',
    initialAmortization: first ? `${fmt(first.correctedBalance)} ÷ ${result.term} parcelas = ${fmt(first.amort)}.` : '',
    effectiveRate: `(1 + ${number.format(result.monthlyRate * 100)}% a.m.)¹² − 1 = ${number.format(result.effective)}% a.a.`,
    totalInterest: `Soma dos juros das ${result.term} parcelas: ${fmt(result.totals.interest)}.`,
    totalDisbursement: `Entrada em dinheiro ${fmt(down - fgtsEntryPortion)} + entrada via FGTS ${fmt(fgtsEntryPortion)} + boletos ${fmt(result.totals.total)} + amortização extraordinária via FGTS ${fmt(result.totals.fgtsAmortization)} + amortização extra mensal ${fmt(result.totals.extraAmortization)} = ${fmt(result.totals.total + result.entry + result.totals.fgtsAmortization + result.totals.extraAmortization)}.`,
    principal: `Valor financiado: ${fmt(result.price)} − ${fmt(result.entry)} = ${fmt(result.financed)}.`,
    totalCorrection: `Soma de todas as correções mensais pela TR: ${fmt(result.totals.correction)}.`,
    totalInsurance: `Soma de MIP e DFI em todas as parcelas: ${fmt(result.totals.insurance)}.`,
    totalFees: `${result.term} parcelas × ${fmt(fee)} = ${fmt(result.totals.fees)}.`,
    fgtsEntry: `${fmt(fgtsEntryPortion)} do FGTS compõem a entrada de ${fmt(result.entry)}. O valor financiado continua sendo definido pela entrada total, independentemente da origem dos recursos.`,
    recalculatedTerm: `Prazo contratado: ${formatFinancingPeriodWithMonths(months)}. Com as amortizações extraordinárias, a quitação ocorre em ${termLabel}, antecipando ${formatFinancingPeriodWithMonths(anticipatedMonths)}.`,
    fgtsAmortizationTotal: anticipatedMonths > 0
      ? `Entrada via FGTS ${fmt(fgtsEntryPortion)} + amortizações extraordinárias com FGTS ${fmt(result.totals.fgtsAmortization)} = ${fmt(fgtsEntryPortion + result.totals.fgtsAmortization)}. Financiamento quitado ${anticipatedMonths} ${anticipatedMonths === 1 ? 'mês' : 'meses'} antes do prazo contratado.`
      : `Entrada via FGTS ${fmt(fgtsEntryPortion)} + amortizações extraordinárias com FGTS ${fmt(result.totals.fgtsAmortization)} = ${fmt(fgtsEntryPortion + result.totals.fgtsAmortization)}.`,
    extraAmortizationTotal: anticipatedMonths > 0
      ? `Soma das amortizações extras mensais (1º mês: ${fmt(extraAmortizationFirstAmount)}, recalculadas a cada mês): ${fmt(result.totals.extraAmortization)}. Financiamento quitado ${anticipatedMonths} ${anticipatedMonths === 1 ? 'mês' : 'meses'} antes do prazo contratado.`
      : `Soma das amortizações extras mensais (1º mês: ${fmt(extraAmortizationFirstAmount)}, recalculadas a cada mês): ${fmt(result.totals.extraAmortization)}.`,
  }), [result, first, last, tr, fee, down, fgtsEntryPortion, anticipatedMonths, months, termLabel, trStatus, extraAmortizationFirstAmount]);


  const exportCsv = () => {
    const header = 'Parcela;Vencimento;Saldo anterior;TR (% a.m.);Correção TR;Saldo corrigido;Amortização;Juros;Prestação;MIP;DFI;Tarifa;Boleto'
      + (extraAmortizationEnabled ? ';Amortização extra' : '')
      + (fgtsAmortizationActive ? ';Depósito FGTS;Saldo FGTS;Amortização FGTS' : '')
      + ';Amortização real;Saldo devedor final'
      + (rentComparisonEnabled ? ';Aluguel;Diferença investida;Carteira locatário;FGTS locatário;Patrimônio locatário' : '')
      + (showTotals ? ';Total boletos' + (fgtsAmortizationActive ? ';Total FGTS' : '') + (extraAmortizationEnabled ? ';Total amortização extra' : '') + ';Total geral' : '');
    const lines = result.rows.map((row) => {
      const rentRow = comparison.rows[row.n - 1];
      return [
        row.n,
        row.due,
        row.openingBalance,
        tr,
        row.correction,
        row.correctedBalance,
        row.amort,
        row.interest,
        row.payment,
        row.mip,
        row.dfi,
        row.fee,
        row.total,
        ...(extraAmortizationEnabled ? [row.extraAmortization] : []),
        ...(fgtsAmortizationActive ? [row.fgtsDeposit, row.fgtsBalance, row.fgtsAmortization] : []),
        row.realAmortization,
        row.balance,
        ...(rentComparisonEnabled ? [rentRow?.rent ?? 0, rentRow?.investedDifference ?? 0, rentRow?.portfolio ?? 0, rentRow?.renterFgts ?? 0, rentRow ? rentRow.portfolio + rentRow.renterFgts : 0] : []),
        ...(showTotals ? [row.cumulativeOwnDisbursed, ...(fgtsAmortizationActive ? [row.cumulativeFgtsDisbursed] : []), ...(extraAmortizationEnabled ? [row.cumulativeExtraAmortization] : []), row.cumulativeOwnDisbursed + row.cumulativeFgtsDisbursed] : []),
      ].map((value, index) => index < 2 ? value : Number(value).toFixed(index === 3 ? 4 : 2).replace('.', ',')).join(';');
    });
    const blob = new Blob(['\ufeff' + [header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = 'simulacao-sac.csv';
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  return <main>
    <header className="topbar"><div className="brand"><span className="mark"><img src={assetPath('/fontoura-logo.png')} alt="Fontoura" width={96} height={34} /></span><span>SimulaLar</span></div></header>
    <section className="hero"><div className="hero-banner"><img src={assetPath('/og.png')} alt="SimulaLar — seu financiamento, mês a mês" width={1731} height={909} fetchPriority="high" /></div><div><p className="eyebrow">Crédito imobiliário, sem mistério</p><h1>Veja seu financiamento<br /><em>mês a mês.</em></h1><p className="subtitle">Ajuste os valores e entenda como entrada, prazo, juros e seguros mudam o custo da sua casa.</p></div></section>

    <section className="workspace">
      <div className="controls card">
        <div className="section-title"><span>01</span><div><h2>Monte seu cenário</h2><p>Use os controles ou digite valores exatos.</p></div></div>
        <MoneyControl label="Valor do imóvel" help={TOOLTIP_COPY.property} value={property} min={100000} max={3000000} step={5000} onChange={updateProperty} />
        <div className="entry-controls">
          <MoneyControl label="Valor da entrada" help={TOOLTIP_COPY.down} value={down} min={minimumDown} max={property} step={0.01} sliderStep={1000} helper={`Mínimo: ${fmt(minimumDown)} (20%)`} onChange={updateDown} />
          <PercentControl label="Percentual de entrada" help={TOOLTIP_COPY.downPercent} value={Number(downPercent.toFixed(4))} min={ENTRY_PERCENT_MIN} max={ENTRY_PERCENT_MAX} step={0.1} helper="Mínimo permitido: 20%" onChange={updateDownPercent} />
        </div>
        <div className="fgts-panel">
          <label className="fgts-toggle"><input type="checkbox" checked={fgtsEnabled} onChange={(event) => setFgtsEnabled(event.target.checked)} /><span>Incluir FGTS na entrada</span><InfoTooltip content={TOOLTIP_COPY.fgtsEnable} /></label>
          {fgtsEnabled && <div className="fgts-fields">
            <div className="field-grid two">
              <MoneyControl label="Saldo atual do FGTS" help={TOOLTIP_COPY.fgtsBalance} value={fgtsBalance} min={0} max={Math.max(down, 1)} step={0.01} sliderStep={1000} onChange={setFgtsBalance} />
              <Field label="Rendimento do FGTS (% a.m.)" help={TOOLTIP_COPY.fgtsYield} value={fgtsYield} min={0} max={20} step={0.0001} onChange={updateFgtsYield} />
            </div>
            <small>Da entrada de {fmt(down)}, {fmt(fgtsEntryPortion)} vêm do FGTS e {fmt(down - fgtsEntryPortion)} de recursos próprios.</small>
            <label className="fgts-toggle"><input type="checkbox" checked={fgtsAmortizationEnabled} onChange={(event) => setFgtsAmortizationEnabled(event.target.checked)} /><span>Usar FGTS para amortizações extraordinárias a cada {FGTS_AMORTIZATION_INTERVAL_MONTHS} meses</span><InfoTooltip content={TOOLTIP_COPY.fgtsAmortizationEnable} /></label>
            {fgtsAmortizationEnabled && <div className="field-grid two">
              <MoneyControl label="Aporte mensal de FGTS" help={TOOLTIP_COPY.fgtsContribution} value={fgtsContribution} min={0} max={10000} step={0.01} sliderStep={10} onChange={setFgtsContribution} />
              <PercentControl label="Reajuste anual do aporte" help={TOOLTIP_COPY.fgtsRaise} value={fgtsRaise} min={0} max={50} step={0.1} onChange={setFgtsRaise} />
            </div>}
          </div>}
        </div>
        <label className="fgts-toggle"><input type="checkbox" checked={extraAmortizationEnabled} onChange={(event) => setExtraAmortizationEnabled(event.target.checked)} /><span>Amortizar saldo devedor todo mês com o valor da última parcela{extraAmortizationEnabled ? ` (1º mês: ${fmt(extraAmortizationFirstAmount)})` : ''}</span><InfoTooltip content={TOOLTIP_COPY.extraAmortizationEnable} /></label>
        <div className="fgts-panel">
          <label className="fgts-toggle"><input type="checkbox" checked={rentComparisonEnabled} onChange={(event) => setRentComparisonEnabled(event.target.checked)} /><span>Comparar com aluguel</span><InfoTooltip content={TOOLTIP_COPY.compareEnable} /></label>
          {rentComparisonEnabled && <div className="fgts-fields">
            <div className="field-grid three">
              <Field label="Aluguel mensal (R$)" help={TOOLTIP_COPY.compareRent} value={rentValue} min={0} max={50000} step={50} onChange={setRentValue} />
              <Field label="Reajuste do aluguel (% a.a.)" help={TOOLTIP_COPY.compareRentRaise} value={rentRaise} min={0} max={30} step={0.1} onChange={setRentRaise} />
              <Field label="Horizonte (meses)" help={TOOLTIP_COPY.compareHorizon} value={compareHorizon} min={12} max={480} step={12} onChange={setCompareHorizon} />
              <Field label="Retorno real (% a.a.)" help={TOOLTIP_COPY.compareInvestReal} value={investReal} min={0} max={20} step={0.1} onChange={setInvestReal} />
              <Field label="IPCA projetado (% a.a.)" help={TOOLTIP_COPY.compareIpca} value={ipca} min={0} max={20} step={0.1} onChange={setIpca} />
              <Field label="Documentação (% do imóvel)" help={TOOLTIP_COPY.compareDoc} value={docPercent} min={0} max={15} step={0.1} onChange={setDocPercent} />
            </div>
            {fgtsAmortizationActive
              ? <small>Os depósitos de FGTS seguem a seção de amortizações extraordinárias: {fmt(fgtsContribution)}/mês com reajuste de {number.format(fgtsRaise)}% a.a., iguais nos dois cenários.</small>
              : <div className="field-grid two">
                <Field label="Depósito mensal de FGTS (R$)" help={TOOLTIP_COPY.compareFgtsContribution} value={compareFgtsContribution} min={0} max={20000} step={50} onChange={setCompareFgtsContribution} />
                <Field label="Reajuste do depósito (% a.a.)" help={TOOLTIP_COPY.compareFgtsRaise} value={compareFgtsRaise} min={0} max={50} step={0.1} onChange={setCompareFgtsRaise} />
              </div>}
            <div className="field-grid three">
              <Field label="Valorização conservadora (% a.a.)" help={TOOLTIP_COPY.compareScenario} value={scenarioConservative} min={0} max={30} step={0.1} onChange={setScenarioConservative} />
              <Field label="Valorização central (% a.a.)" help={TOOLTIP_COPY.compareScenario} value={scenarioCentral} min={0} max={30} step={0.1} onChange={setScenarioCentral} />
              <Field label="Valorização otimista (% a.a.)" help={TOOLTIP_COPY.compareScenario} value={scenarioOptimistic} min={0} max={30} step={0.1} onChange={setScenarioOptimistic} />
            </div>
          </div>}
        </div>
        <div className="field-grid three">
          <Field label="Prazo (meses)" help={TOOLTIP_COPY.months} value={months} min={12} max={420} step={1} onChange={setMonths} />
          <Field label="Juros nominal (% a.a.)" help={TOOLTIP_COPY.annualRate} value={rate} min={0} max={30} step={0.01} onChange={setRate} />
          <DateField label="1º vencimento" help={TOOLTIP_COPY.firstDue} value={firstDue} onChange={setFirstDue} />
        </div>
        <button className="advanced-toggle" onClick={() => setShowAdvanced((visible) => !visible)} aria-expanded={showAdvanced}>{showAdvanced ? '− Ocultar custos avançados' : '+ Incluir TR, seguros e tarifa'}</button>
        {showAdvanced && <div className="advanced-panel">
          <div className="field-grid two">
            <Field label="TR projetada (% a.m.)" help={TOOLTIP_COPY.trProjected} value={tr} min={0} max={20} step={0.0001} onChange={updateTr} />
            <Field label="Seguro MIP (% do saldo/mês)" help={TOOLTIP_COPY.mipRate} value={mipRate} min={0} max={1} step={0.00001} onChange={setMipRate} />
            <Field label="Seguro DFI (% do imóvel/mês)" help={TOOLTIP_COPY.dfiRate} value={dfiRate} min={0} max={1} step={0.00001} onChange={setDfiRate} />
            <Field label="Tarifa administrativa (R$/mês)" help={TOOLTIP_COPY.fee} value={fee} min={0} max={500} step={1} onChange={setFee} />
          </div>
          <div className={`tr-reference ${trSource.kind}`}><b>{trStatus}</b><span>A taxa mensal ativa é repetida nos meses futuros apenas como projeção.</span><a href={TR_API_URL} target="_blank" rel="noreferrer">Consultar série 226 do BCB</a></div>
          <p>As taxas-padrão de seguro foram calibradas com a simulação anexada. Na prática, variam conforme idade, imóvel e seguradora.</p>
        </div>}
      </div>

      <div className="summary card dark-card">
        <div className="section-title light"><span>02</span><div><h2>Seu resultado</h2><p>Estimativa pelo sistema SAC com saldo corrigido pela TR.</p></div></div>
        <div className="primary-result"><HelpLabel label="Valor financiado" help={resultHelp.financed} /><strong>{fmt(result.financed)}</strong><small>{number.format(result.price ? result.financed / result.price * 100 : 0)}% do imóvel</small></div>
        <div className="metrics">
          <Metric label="TR projetada" value={`${trNumber.format(tr)}% a.m.`} help={resultHelp.activeTr} />
          <Metric label="1º boleto" value={fmt(first?.total || 0)} help={resultHelp.firstBoleto} />
          <Metric label="Último boleto" value={fmt(last?.total || 0)} help={resultHelp.lastBoleto} />
          <Metric label="Amortização inicial" value={fmt(result.initialAmort)} help={resultHelp.initialAmortization} />
          <Metric label="Taxa efetiva" value={`${number.format(result.effective)}% a.a.`} help={resultHelp.effectiveRate} />
          <Metric label="Juros totais" value={fmt(result.totals.interest)} help={resultHelp.totalInterest} />
          {hasFgtsEntryPortion && <Metric label="FGTS usado na entrada" value={fmt(fgtsEntryPortion)} help={resultHelp.fgtsEntry} />}
          {hasRecalculatedTerm && <Metric label="Novo prazo" value={termLabel} help={resultHelp.recalculatedTerm} />}
        </div>
        <div className="totals-breakdown">
          <HelpLabel label="Total desembolsado" help={resultHelp.totalDisbursement} />
          <strong>{fmt(result.totals.total + result.entry + result.totals.fgtsAmortization + result.totals.extraAmortization)}</strong>
          <ul>
            <li><span>Entrada em dinheiro</span><b>{fmt(down - fgtsEntryPortion)}</b></li>
            {hasFgtsEntryPortion && <li><span>Entrada via FGTS</span><b>{fmt(fgtsEntryPortion)}</b></li>}
            <li><span>Boletos</span><b>{fmt(result.totals.total)}</b></li>
            {fgtsAmortizationActive && <li><span>Amortização extraordinária via FGTS</span><b>{fmt(result.totals.fgtsAmortization)}</b></li>}
            {extraAmortizationEnabled && <li><span>Amortização extra mensal</span><b>{fmt(result.totals.extraAmortization)}</b></li>}
          </ul>
        </div>
        <div className="legend"><span><i className="orange" />Boleto</span><span><i className="blue" />Saldo devedor</span></div><EvolutionChart rows={result.rows} termLabel={termLabel} />
      </div>
    </section>

    <section className="details">
      <div className="details-head"><div><p className="eyebrow">Transparência total</p><h2>Evolução completa do financiamento</h2><p>Todas as {result.term} parcelas, do primeiro vencimento à quitação.</p></div><button className="export" onClick={exportCsv}>Baixar planilha CSV</button></div>
      <div className="cost-strip">
        <Metric label="Principal" value={fmt(result.financed)} help={resultHelp.principal} />
        <Metric label="Correção TR" value={fmt(result.totals.correction)} help={resultHelp.totalCorrection} />
        <Metric label="Juros" value={fmt(result.totals.interest)} help={resultHelp.totalInterest} />
        <Metric label="Seguros" value={fmt(result.totals.insurance)} help={resultHelp.totalInsurance} />
        <Metric label="Tarifas" value={fmt(result.totals.fees)} help={resultHelp.totalFees} />
        {fgtsAmortizationActive && <Metric label="Amortizado via FGTS" value={fmt(fgtsEntryPortion + result.totals.fgtsAmortization)} help={resultHelp.fgtsAmortizationTotal} />}
        {extraAmortizationEnabled && <Metric label="Amortização extra mensal" value={fmt(result.totals.extraAmortization)} help={resultHelp.extraAmortizationTotal} />}
      </div>
      <div className="table-card">
        <div className="table-toolbar">
          <div>
            <strong>{result.term} parcelas exibidas</strong>
            <span>Use os ícones de informação para entender cada cálculo.</span>
          </div>
          <div className="table-actions">
            {fgtsAmortizationActive && (
              <button
                className="detail-toggle"
                onClick={() => setShowFgtsDetails((visible) => !visible)}
                aria-expanded={showFgtsDetails}
              >
                {showFgtsDetails ? 'Ocultar detalhes do FGTS' : 'Exibir detalhes do FGTS'}
              </button>
            )}
            {rentComparisonEnabled && (
              <button
                className="detail-toggle"
                onClick={() => setShowRentDetails((visible) => !visible)}
                aria-expanded={showRentDetails}
              >
                {showRentDetails ? 'Ocultar comparação com aluguel' : 'Exibir comparação com aluguel'}
              </button>
            )}
            <button
              className="detail-toggle"
              onClick={() => setShowTableDetails((visible) => !visible)}
              aria-expanded={showTableDetails}
            >
              {showTableDetails ? 'Ocultar detalhes do boleto' : 'Exibir detalhes do boleto'}
            </button>
            <button
              className="detail-toggle"
              onClick={() => setShowTotals((visible) => !visible)}
              aria-expanded={showTotals}
            >
              {showTotals ? 'Ocultar totalizadores' : 'Exibir totalizadores'}
            </button>
          </div>
        </div>
        <div className="table-scroll"><table className={showTableDetails ? 'is-detailed' : ''}><thead><tr>
          <TableHead label="Nº" help={TOOLTIP_COPY.installmentNumber} />
          <TableHead label="Vencimento" help={TOOLTIP_COPY.dueDate} />
          {showTableDetails && <>
            <TableHead label="Saldo anterior" help={TOOLTIP_COPY.openingBalance} />
            <TableHead label="Correção TR" help={TOOLTIP_COPY.trCorrection} />
            <TableHead label="Saldo corrigido" help={TOOLTIP_COPY.correctedBalance} />
            <TableHead label="Amortização" help={TOOLTIP_COPY.amortization} />
            <TableHead label="Juros" help={TOOLTIP_COPY.interest} />
            <TableHead label="Prestação" help={TOOLTIP_COPY.payment} />
            <TableHead label="MIP" help={TOOLTIP_COPY.mip} />
            <TableHead label="DFI" help={TOOLTIP_COPY.dfi} />
            <TableHead label="Tarifa" help={TOOLTIP_COPY.monthlyFee} />
          </>}
          <TableHead label="Boleto" help={TOOLTIP_COPY.boleto} />
          {extraAmortizationEnabled && <TableHead label="Amortização extra" help={TOOLTIP_COPY.extraAmortizationColumn} />}
          {fgtsAmortizationActive && showFgtsDetails && <>
            <TableHead label="Depósito FGTS" help={TOOLTIP_COPY.fgtsDepositColumn} />
            <TableHead label="Saldo FGTS" help={TOOLTIP_COPY.fgtsBalanceColumn} />
            <TableHead label="Amortização FGTS" help={TOOLTIP_COPY.fgtsAmortizationColumn} />
          </>}
          <TableHead label="Amortização real" help={TOOLTIP_COPY.realAmortization} />
          <TableHead label="Saldo devedor" help={TOOLTIP_COPY.endingBalance} />
          {rentComparisonEnabled && showRentDetails && <>
            <TableHead label="Aluguel" help={TOOLTIP_COPY.rentColumn} />
            <TableHead label="Diferença investida" help={TOOLTIP_COPY.investedDifferenceColumn} />
            <TableHead label="Carteira do locatário" help={TOOLTIP_COPY.renterPortfolioColumn} />
            <TableHead label="FGTS do locatário" help={TOOLTIP_COPY.renterFgtsColumn} />
            <TableHead label="Patrimônio do locatário" help={TOOLTIP_COPY.renterNetWorthColumn} />
          </>}
          {showTotals && <TableHead label="Total boletos" help={TOOLTIP_COPY.ownTotalColumn} />}
          {showTotals && fgtsAmortizationActive && <TableHead label="Total FGTS" help={TOOLTIP_COPY.fgtsTotalColumn} />}
          {showTotals && extraAmortizationEnabled && <TableHead label="Total amortização extra" help={TOOLTIP_COPY.extraAmortizationTotalColumn} />}
          {showTotals && <TableHead label="Total geral" help={TOOLTIP_COPY.grandTotalColumn} />}
        </tr></thead><tbody>{result.rows.map((row) => {
          const rentRow = comparison.rows[row.n - 1];
          return <tr key={row.n}>
            <td><span className="installment-number"><span>{row.n}</span><InfoTooltip content={formatFinancingPeriod(row.n)} /></span></td><td>{row.due}</td>
            {showTableDetails && <><td>{fmt(row.openingBalance)}</td><td>{fmt(row.correction)}</td><td>{fmt(row.correctedBalance)}</td><td>{fmt(row.amort)}</td><td>{fmt(row.interest)}</td><td>{fmt(row.payment)}</td><td>{fmt(row.mip)}</td><td>{fmt(row.dfi)}</td><td>{fmt(row.fee)}</td></>}
            <td><b>{fmt(row.total)}</b></td>
            {extraAmortizationEnabled && <td>{fmt(row.extraAmortization)}</td>}
            {fgtsAmortizationActive && showFgtsDetails && <>
              <td>{fmt(row.fgtsDeposit)}</td>
              <td>{fmt(row.fgtsBalance)}</td>
              <td>{fmt(row.fgtsAmortization)}</td>
            </>}
            <td>{fmt(row.realAmortization)}</td><td>{fmt(row.balance)}</td>
            {rentComparisonEnabled && showRentDetails && <>
              <td>{rentRow ? fmt(rentRow.rent) : '—'}</td>
              <td>{rentRow ? fmt(rentRow.investedDifference) : '—'}</td>
              <td>{rentRow ? fmt(rentRow.portfolio) : '—'}</td>
              <td>{rentRow ? fmt(rentRow.renterFgts) : '—'}</td>
              <td>{rentRow ? <b>{fmt(rentRow.portfolio + rentRow.renterFgts)}</b> : '—'}</td>
            </>}
            {showTotals && <td>{fmt(row.cumulativeOwnDisbursed)}</td>}
            {showTotals && fgtsAmortizationActive && <td>{fmt(row.cumulativeFgtsDisbursed)}</td>}
            {showTotals && extraAmortizationEnabled && <td>{fmt(row.cumulativeExtraAmortization)}</td>}
            {showTotals && <td><b>{fmt(row.cumulativeOwnDisbursed + row.cumulativeFgtsDisbursed)}</b></td>}
          </tr>;
        })}</tbody></table></div>
      </div>
      <div className="disclaimer"><b>Importante</b><p>Esta é uma simulação matemática independente, inspirada na estrutura do demonstrativo da CAIXA. Não representa proposta de crédito. TR, seguros, CET, tarifas, datas e valores reais dependem das condições contratuais e da análise do banco.</p></div>
    </section>

    {rentComparisonEnabled && <section className="details">
      <div className="details-head"><div><p className="eyebrow">Comprar ou alugar?</p><h2>Comparativo: financiar × alugar e investir</h2><p>Patrimônio de quem compra contra o de quem aluga e investe a diferença, em {formatFinancingPeriodWithMonths(comparison.horizonMonths)}. Ajuste as premissas na seção “Monte seu cenário”.</p></div></div>
      <div className="compare-grid single">
        <div className="card dark-card">
          <div className="section-title light"><span>03</span><div><h2>Patrimônio no horizonte</h2><p>Locatário começa investindo {fmt(comparison.initialPortfolio)} (entrada própria + documentação de {fmt(comparison.documentationCosts)}).</p></div></div>
          <div className="primary-result"><HelpLabel label="Patrimônio do locatário" help={TOOLTIP_COPY.compareRenterNetWorth} /><strong>{fmt(comparison.renterNetWorth)}</strong><small>carteira {fmt(comparison.portfolio)} + FGTS {fmt(comparison.renterFgts)}</small></div>
          <div className="metrics">
            <Metric label="Carteira investida" value={fmt(comparison.portfolio)} help={TOOLTIP_COPY.comparePortfolio} />
            <Metric label="FGTS do locatário" value={fmt(comparison.renterFgts)} help={TOOLTIP_COPY.compareRenterFgts} />
            <Metric label="Saldo devedor no horizonte" value={fmt(comparison.debtBalance)} help={TOOLTIP_COPY.compareDebt} />
            <Metric label="FGTS do comprador" value={fmt(comparison.buyerFgts)} help={TOOLTIP_COPY.compareBuyerFgts} />
            <Metric label="Saldo residual após FGTS" value={fmt(comparison.residualDebt)} help={TOOLTIP_COPY.compareResidualDebt} />
            <Metric label="Aluguel total pago" value={fmt(comparison.totalRentPaid)} help={TOOLTIP_COPY.compareTotalRent} />
            <Metric label="Boletos pagos no período" value={fmt(comparison.totalBuyerPaid)} help={TOOLTIP_COPY.compareTotalBuyer} />
            <Metric label="Breakeven de valorização" value={comparison.breakevenAnnualPercent === null ? '—' : `${number.format(comparison.breakevenAnnualPercent)}% a.a.`} help={TOOLTIP_COPY.compareBreakeven} />
          </div>
        </div>
      </div>
      <div className="table-card">
        <div className="table-toolbar"><div><strong>Cenários de valorização do imóvel</strong><span>Patrimônio do comprador = imóvel valorizado − saldo residual + FGTS remanescente após a quitação.</span></div></div>
        <div className="table-scroll"><table><thead><tr>
          <th>Cenário</th>
          <th>Valorização</th>
          <th>Valor do imóvel no horizonte</th>
          <th>Patrimônio do comprador</th>
          <th>Diferença vs locatário</th>
        </tr></thead><tbody>{comparison.scenarios.map((scenario, index) => <tr key={SCENARIO_LABELS[index] ?? index}>
          <td>{SCENARIO_LABELS[index] ?? `Cenário ${index + 1}`}</td>
          <td>{number.format(scenario.appreciationAnnualPercent)}% a.a.</td>
          <td>{fmt(scenario.propertyValue)}</td>
          <td><b>{fmt(scenario.buyerNetWorth)}</b></td>
          <td><b>{scenario.advantage >= 0 ? 'Comprar vence' : 'Alugar vence'}</b> por {fmt(Math.abs(scenario.advantage))}</td>
        </tr>)}</tbody></table></div>
      </div>
      <div className="disclaimer"><b>Importante</b><p>O comparativo assume condomínio e IPTU equivalentes nos dois cenários e não considera impostos sobre os investimentos nem custos de venda do imóvel. Valorização, reajuste de aluguel e retornos são projeções ajustáveis, não garantias.</p></div>
    </section>}
    <footer><div className="brand"><span className="mark"><img src={assetPath('/fontoura-logo.png')} alt="Fontoura" width={76} height={27} /></span><span>SimulaLar</span></div><span>Feito para comparar cenários com clareza.</span></footer>
  </main>;
}

function InfoTooltip({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12, width: 260 });
  const id = useId();
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(280, window.innerWidth - 24);
      const left = clamp(rect.left + rect.width / 2 - width / 2, 12, window.innerWidth - width - 12);
      const below = rect.bottom + 9;
      const top = below + 140 > window.innerHeight ? Math.max(12, rect.top - 149) : below;
      setPosition({ left, top, width });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!wrapperRef.current?.contains(target) && !popupRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.blur();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return <span className="info-tooltip" ref={wrapperRef} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button ref={buttonRef} type="button" aria-label="Entenda este cálculo" aria-expanded={open} aria-describedby={open ? id : undefined} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)}>i</button>
    {open && typeof document !== 'undefined' && createPortal(<span ref={popupRef} id={id} role="tooltip" className="tooltip-popup" style={position}>{content}</span>, document.body)}
  </span>;
}

function HelpLabel({ label, help }: { label: string; help: string }) {
  return <span className="help-label"><span>{label}</span><InfoTooltip content={help} /></span>;
}

function MoneyControl({ label, help, value, min, max, step, sliderStep, helper, onChange }: { label: string; help: string; value: number; min: number; max: number; step: number; sliderStep?: number; helper?: string; onChange: (value: number) => void }) {
  const inputId = useId();
  return <div className="money-control"><div className="field-title"><label htmlFor={inputId}>{label}</label><InfoTooltip content={help} /></div><div className="money-input"><span>R$</span><input id={inputId} type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(clamp(+event.target.value, min, max))} /></div><input aria-label={`${label} controle deslizante`} type="range" min={min} max={max} step={sliderStep ?? step} value={value} onChange={(event) => onChange(+event.target.value)} />{helper && <small>{helper}</small>}</div>;
}

function PercentControl({ label, help, value, min, max, step, helper, onChange }: { label: string; help: string; value: number; min: number; max: number; step: number; helper?: string; onChange: (value: number) => void }) {
  const inputId = useId();
  return <div className="money-control"><div className="field-title"><label htmlFor={inputId}>{label}</label><InfoTooltip content={help} /></div><div className="percent-input"><input id={inputId} type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(clamp(+event.target.value, min, max))} /><span>%</span></div><input aria-label={`${label} controle deslizante`} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(+event.target.value)} />{helper && <small>{helper}</small>}</div>;
}

function Field({ label, help, value, min, max, step, onChange }: { label: string; help: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  const inputId = useId();
  return <div className="compact-label"><div className="field-title"><label htmlFor={inputId}>{label}</label><InfoTooltip content={help} /></div><input id={inputId} type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(clamp(+event.target.value, min, max))} /></div>;
}

function DateField({ label, help, value, onChange }: { label: string; help: string; value: string; onChange: (value: string) => void }) {
  const inputId = useId();
  return <div className="compact-label"><div className="field-title"><label htmlFor={inputId}>{label}</label><InfoTooltip content={help} /></div><input id={inputId} type="date" value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function Metric({ label, value, help }: { label: string; value: string; help: string }) {
  return <div className="metric"><HelpLabel label={label} help={help} /><b>{value}</b></div>;
}

function TableHead({ label, help }: { label: string; help: string }) {
  return <th><HelpLabel label={label} help={help} /></th>;
}
