import assert from 'node:assert/strict';
import {
  annualToMonthlyRate,
  calculateSchedule,
  clampFgtsToEntry,
  compareRentVsBuy,
  composeRealAndInflation,
  computeFgtsMonthlyRate,
  entryFromPercent,
  entryPercentFromAmount,
  FGTS_AMORTIZATION_INTERVAL_MONTHS,
  FGTS_MONTHLY_YIELD_BONUS,
  fetchTrReference,
  formatFinancingPeriod,
  formatFinancingPeriodWithMonths,
  normalizeEntryAmount,
  parseBcbTrPayload,
  shouldApplyAutomaticTr,
  TR_API_URL,
  TR_FALLBACK,
} from '../app/financing.ts';

const base = {
  property: 650000,
  down: 130000,
  months: 420,
  annualNominalRate: 10.74,
  mipMonthlyPercent: 0.01536,
  dfiMonthlyPercent: 0.013,
  monthlyFee: 25,
  firstDue: '2026-09-28',
};

assert.equal(TR_API_URL, 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.226/dados/ultimos/1?formato=json');
assert.deepEqual(parseBcbTrPayload([{ data: '27/08/2026', dataFim: '27/09/2026', valor: '0.1692' }]), {
  monthlyPercent: 0.1692,
  startDate: '27/08/2026',
  endDate: '27/09/2026',
});
assert.deepEqual(parseBcbTrPayload([{ data: '27/08/2026', dataFim: '27/09/2026', valor: '0.0001' }]), {
  monthlyPercent: 0.0001,
  startDate: '27/08/2026',
  endDate: '27/09/2026',
});
assert.throws(() => parseBcbTrPayload([]));
assert.throws(() => parseBcbTrPayload([null]));
assert.throws(() => parseBcbTrPayload([{ data: '27/08/2026', valor: 'inválido' }]));
assert.throws(() => parseBcbTrPayload([{ data: '27/08/2026', dataFim: '27/09/2026', valor: '-0.01' }]));
assert.throws(() => parseBcbTrPayload([{ data: '27/08/2026', dataFim: '27/09/2026', valor: '21' }]));
assert.throws(() => parseBcbTrPayload([{ data: '31/02/2026', dataFim: '27/09/2026', valor: '0.1692' }]));
assert.throws(() => parseBcbTrPayload([{ data: '27/08/2026', dataFim: '31/02/2026', valor: '0.1692' }]));
assert.throws(() => parseBcbTrPayload([{ data: '27/08/2026', dataFim: '27/09/2026', valor: 'NaN' }]));
assert.equal(TR_FALLBACK.monthlyPercent, 0.1692);
assert.equal(shouldApplyAutomaticTr(false), true);
assert.equal(shouldApplyAutomaticTr(true), false);

async function validFetch() {
  return {
    ok: true,
    json: async () => [{ data: '27/08/2026', dataFim: '27/09/2026', valor: '0.1692' }],
  };
}

async function invalidFetch() {
  return { ok: false, json: async () => [] };
}

async function failingFetch() {
  throw new Error('offline');
}

assert.deepEqual(await fetchTrReference(validFetch), {
  source: 'bcb',
  reference: {
    monthlyPercent: 0.1692,
    startDate: '27/08/2026',
    endDate: '27/09/2026',
  },
});
assert.deepEqual(await invalidFetch().then((response) => response.json()), []);
assert.deepEqual(await fetchTrReference(invalidFetch), { source: 'fallback', reference: null });
assert.deepEqual(await fetchTrReference(failingFetch), { source: 'fallback', reference: null });

assert.equal(entryFromPercent(650000, 10), 130000);
assert.equal(entryFromPercent(650000, 20), 130000);
assert.equal(entryFromPercent(650000, 35.5), 230750);
assert.equal(entryFromPercent(650000, 120), 650000);
assert.equal(normalizeEntryAmount(650000, 0), 130000);
assert.equal(normalizeEntryAmount(650000, 700000), 650000);
assert.equal(entryPercentFromAmount(650000, 130000), 20);
assert.equal(entryPercentFromAmount(650000, 230750), 35.5);
assert.equal(entryFromPercent(800000, entryPercentFromAmount(650000, 195000)), 240000);
assert.equal(formatFinancingPeriod(1), '1 mês');
assert.equal(formatFinancingPeriod(10), '10 meses');
assert.equal(formatFinancingPeriod(12), '1 ano');
assert.equal(formatFinancingPeriod(14), '1 ano e 2 meses');
assert.equal(formatFinancingPeriod(24), '2 anos');
assert.equal(formatFinancingPeriod(28), '2 anos e 4 meses');
assert.equal(formatFinancingPeriod(37), '3 anos e 1 mês');
assert.equal(formatFinancingPeriodWithMonths(0), '0 meses ("0 meses")');
assert.equal(formatFinancingPeriodWithMonths(1), '1 mês ("1 mês")');
assert.equal(formatFinancingPeriodWithMonths(10), '10 meses ("10 meses")');
assert.equal(formatFinancingPeriodWithMonths(12), '1 ano ("12 meses")');
assert.equal(formatFinancingPeriodWithMonths(14), '1 ano e 2 meses ("14 meses")');
assert.equal(formatFinancingPeriodWithMonths(24), '2 anos ("24 meses")');

const belowMinimumEntry = calculateSchedule({ ...base, down: 0, trMonthlyPercent: 0 });
assert.equal(belowMinimumEntry.entry, 130000);

const endOfMonthSchedule = calculateSchedule({ ...base, months: 3, firstDue: '2026-01-31', trMonthlyPercent: 0 });
assert.deepEqual(endOfMonthSchedule.rows.map((row) => row.due), ['31/01/2026', '28/02/2026', '31/03/2026']);

const leapYearSchedule = calculateSchedule({ ...base, months: 2, firstDue: '2028-01-31', trMonthlyPercent: 0 });
assert.equal(leapYearSchedule.rows[1].due, '29/02/2028');

const withoutTr = calculateSchedule({ ...base, trMonthlyPercent: 0 });
assert.equal(withoutTr.rows.length, 420);
assert.equal(withoutTr.rows[0].openingBalance, 520000);
assert.equal(withoutTr.rows[0].correction, 0);
assert.equal(withoutTr.rows[0].correctedBalance, 520000);
assert.ok(Math.abs(withoutTr.rows[0].amort - 520000 / 420) < 1e-8);
assert.ok(Math.abs(withoutTr.rows[0].realAmortization - withoutTr.rows[0].amort) < 1e-8);
assert.ok(withoutTr.rows.at(-1).balance <= 0.01);

const withTr = calculateSchedule({ ...base, trMonthlyPercent: 0.1692 });
assert.equal(withTr.rows[0].openingBalance, 520000);
assert.ok(Math.abs(withTr.rows[0].correction - 879.84) < 0.001);
assert.ok(Math.abs(withTr.rows[0].correctedBalance - 520879.84) < 0.001);
assert.ok(Math.abs(withTr.rows[0].amort - 520879.84 / 420) < 0.001);
assert.ok(Math.abs(withTr.rows[0].realAmortization - 360.3500952381) < 0.001);
assert.ok(Math.abs(withTr.rows[0].realAmortization - (withTr.rows[0].amort - withTr.rows[0].correction)) < 0.001);
assert.ok(Math.abs(withTr.rows[0].payment - withTr.rows[0].amort - withTr.rows[0].interest) <= 0.01);
assert.ok(Math.abs(withTr.rows[0].total - withTr.rows[0].payment - withTr.rows[0].mip - withTr.rows[0].dfi - withTr.rows[0].fee) <= 0.01);
assert.ok(withTr.rows.at(-1).balance <= 0.01);
assert.ok(withTr.totals.correction > 0);

assert.equal(FGTS_MONTHLY_YIELD_BONUS, 0.25);
assert.equal(computeFgtsMonthlyRate(0.1692), 0.4192);
assert.equal(computeFgtsMonthlyRate(-1), 0.25);

assert.equal(clampFgtsToEntry(130000, 200000), 130000);
assert.equal(clampFgtsToEntry(130000, 50000), 50000);
assert.equal(clampFgtsToEntry(130000, -10), 0);

const fgtsCompositionOnly = calculateSchedule({ ...base, trMonthlyPercent: 0.1692, fgts: { currentBalance: 50000, monthlyYieldPercent: 0.4192 } });
assert.equal(fgtsCompositionOnly.rows.length, withTr.rows.length);
assert.equal(fgtsCompositionOnly.totals.fgtsAmortization, 0);
assert.ok(Math.abs(fgtsCompositionOnly.rows.at(-1).balance - withTr.rows.at(-1).balance) < 1e-8);

const noFeeBase = { property: 100000, down: 20000, months: 36, annualNominalRate: 0, trMonthlyPercent: 0, mipMonthlyPercent: 0, dfiMonthlyPercent: 0, monthlyFee: 0, firstDue: '2026-01-31' };

const fgtsPartialAmortization = calculateSchedule({
  ...noFeeBase,
  fgts: { currentBalance: 0, monthlyYieldPercent: 0, extraordinaryAmortization: { monthlyContribution: 300, annualRaisePercent: 0 } },
});
assert.equal(fgtsPartialAmortization.rows.length, 36);
assert.equal(fgtsPartialAmortization.term, 36);
assert.equal(fgtsPartialAmortization.rows[0].fgtsDeposit, 300);
assert.equal(fgtsPartialAmortization.rows[0].fgtsBalance, 300);
assert.equal(fgtsPartialAmortization.rows[11].fgtsDeposit, 300);
assert.equal(fgtsPartialAmortization.rows[11].fgtsBalance, 3600);
assert.equal(fgtsPartialAmortization.rows[23].fgtsDeposit, 300);
assert.ok(Math.abs(fgtsPartialAmortization.rows[23].fgtsAmortization - 7200) < 0.01);
assert.equal(fgtsPartialAmortization.rows[23].fgtsBalance, 0);
assert.equal(fgtsPartialAmortization.rows[24].fgtsDeposit, 300);
assert.equal(fgtsPartialAmortization.rows[24].fgtsBalance, 300);
assert.equal(fgtsPartialAmortization.rows[24].fgtsAmortization, 0);
assert.ok(Math.abs(fgtsPartialAmortization.totals.fgtsAmortization - 7200) < 0.01);
assert.ok(fgtsPartialAmortization.rows.at(-1).balance <= 0.01);

const fgtsWithRaiseAndYield = calculateSchedule({
  ...noFeeBase,
  fgts: { currentBalance: 0, monthlyYieldPercent: 1, extraordinaryAmortization: { monthlyContribution: 500, annualRaisePercent: 10 } },
});
assert.equal(fgtsWithRaiseAndYield.rows[0].fgtsDeposit, 500);
assert.equal(fgtsWithRaiseAndYield.rows[0].fgtsBalance, 500);
assert.equal(fgtsWithRaiseAndYield.rows[11].fgtsDeposit, 500);
assert.equal(fgtsWithRaiseAndYield.rows[12].fgtsDeposit, 550);

const fgtsEarlyPayoff = calculateSchedule({
  ...noFeeBase,
  fgts: { currentBalance: 0, monthlyYieldPercent: 0, extraordinaryAmortization: { monthlyContribution: 1500, annualRaisePercent: 0 } },
});
assert.equal(fgtsEarlyPayoff.rows.length, 24);
assert.equal(fgtsEarlyPayoff.term, 24);
assert.equal(fgtsEarlyPayoff.rows[23].fgtsDeposit, 1500);
// FGTS abate após o boleto: saldo restante = 80000 × 12/36
assert.ok(Math.abs(fgtsEarlyPayoff.rows.at(-1).fgtsAmortization - 26666.666666) < 0.01);
assert.ok(fgtsEarlyPayoff.rows.at(-1).fgtsBalance >= 0);
assert.ok(fgtsEarlyPayoff.rows.at(-1).balance <= 0.01);

const noFgtsCumulative = calculateSchedule({ ...base, trMonthlyPercent: 0.1692 });
assert.ok(noFgtsCumulative.rows.every((row) => row.cumulativeFgtsDisbursed === 0));
assert.ok(Math.abs(noFgtsCumulative.rows.at(-1).cumulativeOwnDisbursed - (noFgtsCumulative.entry + noFgtsCumulative.totals.total)) < 0.01);

const fgtsEntryPortion = clampFgtsToEntry(fgtsPartialAmortization.entry, 5000);
const fgtsCumulative = calculateSchedule({
  ...noFeeBase,
  fgts: { currentBalance: 5000, monthlyYieldPercent: 0, extraordinaryAmortization: { monthlyContribution: 300, annualRaisePercent: 0 } },
});
assert.equal(fgtsCumulative.rows[0].cumulativeFgtsDisbursed, fgtsEntryPortion);
fgtsCumulative.rows.forEach((row, index) => {
  const isAmortizationMonth = (index + 1) % FGTS_AMORTIZATION_INTERVAL_MONTHS === 0;
  assert.equal(row.fgtsAmortization > 0, isAmortizationMonth && row.n <= fgtsCumulative.term);
});
assert.ok(Math.abs(fgtsCumulative.rows.at(-1).cumulativeFgtsDisbursed - (fgtsEntryPortion + fgtsCumulative.totals.fgtsAmortization)) < 0.01);
assert.ok(Math.abs(fgtsCumulative.rows.at(-1).cumulativeOwnDisbursed - (fgtsCumulative.entry - fgtsEntryPortion + fgtsCumulative.totals.total)) < 0.01);
assert.ok(Math.abs(
  (fgtsCumulative.rows.at(-1).cumulativeOwnDisbursed + fgtsCumulative.rows.at(-1).cumulativeFgtsDisbursed)
  - (fgtsCumulative.entry + fgtsCumulative.totals.total + fgtsCumulative.totals.fgtsAmortization),
) < 0.01);

assert.ok(noFgtsCumulative.rows.every((row) => row.extraAmortization === 0 && row.cumulativeExtraAmortization === 0));
assert.equal(noFgtsCumulative.totals.extraAmortization, 0);

// Sem juros/TR: extra mensal = amortização do boleto, boleto constante e prazo cai pela metade
const extraHalving = calculateSchedule({ ...noFeeBase, extraAmortization: { payLastInstallmentMonthly: true } });
assert.equal(extraHalving.rows.length, 18);
assert.equal(extraHalving.term, 18);
let extraAccumulated = 0;
extraHalving.rows.forEach((row) => {
  assert.ok(Math.abs(row.amort - 80000 / 36) < 0.01);
  assert.ok(Math.abs(row.extraAmortization - 80000 / 36) < 0.01);
  extraAccumulated += row.extraAmortization;
  assert.ok(Math.abs(row.cumulativeExtraAmortization - extraAccumulated) < 1e-8);
});
assert.ok(Math.abs(extraHalving.totals.extraAmortization - 40000) < 0.01);
assert.ok(extraHalving.rows.at(-1).balance <= 0.01);
assert.ok(Math.abs(
  extraHalving.rows.at(-1).cumulativeOwnDisbursed
  - (extraHalving.entry + extraHalving.totals.total + extraHalving.totals.extraAmortization),
) < 0.01);

// Com juros 1% a.m.: extra do mês = saldo pós-boleto ÷ restantes × (1 + juros)
const extraWithInterest = calculateSchedule({ ...noFeeBase, months: 4, annualNominalRate: 12, extraAmortization: { payLastInstallmentMonthly: true } });
assert.equal(extraWithInterest.rows.length, 2);
assert.ok(Math.abs(extraWithInterest.rows[0].extraAmortization - 20200) < 0.01);
assert.ok(Math.abs(extraWithInterest.rows[1].extraAmortization - 19900) < 0.01);
assert.ok(extraWithInterest.rows.at(-1).balance <= 0.01);

// Com TR 10% a.m.: projeção usa (1+TR)^restantes — 58666,67 × 1,1² ÷ 2
const extraWithTr = calculateSchedule({ ...noFeeBase, months: 3, trMonthlyPercent: 10, extraAmortization: { payLastInstallmentMonthly: true } });
assert.equal(extraWithTr.rows.length, 2);
assert.ok(Math.abs(extraWithTr.rows[0].extraAmortization - 58666.666666 * 1.21 / 2) < 0.01);
assert.ok(extraWithTr.rows.at(-1).balance <= 0.01);

// Combinado: boleto → extra → FGTS; FGTS do mês 24 abate saldo já reduzido pelas extras
const combinedFgtsAndExtra = calculateSchedule({
  ...noFeeBase,
  months: 60,
  fgts: { currentBalance: 0, monthlyYieldPercent: 0, extraordinaryAmortization: { monthlyContribution: 300, annualRaisePercent: 0 } },
  extraAmortization: { payLastInstallmentMonthly: true },
});
assert.equal(combinedFgtsAndExtra.rows.length, 30);
assert.ok(Math.abs(combinedFgtsAndExtra.rows[23].fgtsAmortization - 7200) < 0.01);
assert.ok(combinedFgtsAndExtra.rows.at(-1).balance <= 0.01);
assert.ok(combinedFgtsAndExtra.totals.fgtsAmortization > 0);
assert.ok(combinedFgtsAndExtra.totals.extraAmortization > 0);

// Conversões de taxa do comparativo comprar × alugar
assert.equal(annualToMonthlyRate(0), 0);
assert.ok(Math.abs(annualToMonthlyRate(5) - 0.0040741237836483535) < 1e-12);
assert.ok(Math.abs(annualToMonthlyRate(12.682503013196977) - 0.01) < 1e-12);
assert.ok(Math.abs(composeRealAndInflation(6, 4.5) - 10.77) < 1e-9);
assert.equal(composeRealAndInflation(0, 0), 0);

const compareBase = { property: 100000, down: 20000, months: 10, annualNominalRate: 0, trMonthlyPercent: 0, mipMonthlyPercent: 0, dfiMonthlyPercent: 0, monthlyFee: 0, firstDue: '2026-01-31' };
const compareDefaults = {
  horizonMonths: 12,
  initialRent: 1000,
  rentAnnualAdjustPercent: 0,
  investmentAnnualRealPercent: 0,
  ipcaAnnualPercent: 0,
  documentationPercent: 0,
  fgtsMonthlyYieldPercent: 0,
  fgtsMonthlyContribution: 0,
  fgtsAnnualRaisePercent: 0,
  appreciationScenariosAnnualPercent: [0],
};

// Sem juros: 10 boletos de 8000; locatário paga 1000/mês e investe o resto sem rendimento
const compareZero = compareRentVsBuy(compareBase, compareDefaults);
assert.equal(compareZero.horizonMonths, 12);
assert.equal(compareZero.documentationCosts, 0);
assert.equal(compareZero.initialPortfolio, 20000);
assert.equal(compareZero.rows.length, 12);
assert.ok(Math.abs(compareZero.rows[0].buyerOutlay - 8000) < 0.01);
assert.equal(compareZero.rows[11].buyerOutlay, 0);
assert.ok(Math.abs(compareZero.portfolio - 88000) < 0.01);
assert.equal(compareZero.renterFgts, 0);
assert.ok(Math.abs(compareZero.renterNetWorth - 88000) < 0.01);
assert.equal(compareZero.debtBalance, 0);
assert.equal(compareZero.residualDebt, 0);
assert.ok(Math.abs(compareZero.totalRentPaid - 12000) < 0.01);
assert.ok(Math.abs(compareZero.totalBuyerPaid - 80000) < 0.01);
assert.ok(Math.abs(compareZero.scenarios[0].propertyValue - 100000) < 0.01);
assert.ok(Math.abs(compareZero.scenarios[0].buyerNetWorth - 100000) < 0.01);
assert.ok(Math.abs(compareZero.scenarios[0].advantage - 12000) < 0.01);
assert.ok(Math.abs(compareZero.breakevenAnnualPercent - -12) < 1e-9);

// No breakeven, o patrimônio do comprador iguala o do locatário
const breakevenCheck = compareRentVsBuy(compareBase, { ...compareDefaults, appreciationScenariosAnnualPercent: [compareZero.breakevenAnnualPercent] });
assert.ok(Math.abs(breakevenCheck.scenarios[0].advantage) < 0.01);

// Aluguel reajusta em degraus anuais
const compareRentSteps = compareRentVsBuy(compareBase, { ...compareDefaults, horizonMonths: 13, rentAnnualAdjustPercent: 10 });
assert.equal(compareRentSteps.rows[0].rent, 1000);
assert.equal(compareRentSteps.rows[11].rent, 1000);
assert.ok(Math.abs(compareRentSteps.rows[12].rent - 1100) < 1e-9);

// Documentação entra no desembolso inicial sem abater o saldo devedor
const compareDoc = compareRentVsBuy(compareBase, { ...compareDefaults, documentationPercent: 4.5 });
assert.equal(compareDoc.documentationCosts, 4500);
assert.equal(compareDoc.initialPortfolio, 24500);
assert.equal(calculateSchedule(compareBase).financed, 80000);
assert.ok(Math.abs(compareDoc.portfolio - 92500) < 0.01);

// Carteira rende taxa mensal composta equivalente à anual
const compareYield = compareRentVsBuy(compareBase, { ...compareDefaults, horizonMonths: 1, investmentAnnualRealPercent: 12.682503013196977 });
assert.ok(Math.abs(compareYield.portfolio - (20000 * 1.01 + 7000)) < 1e-6);

// FGTS: comprador usa parte na entrada; locatário mantém o saldo; depósitos iguais nos dois cenários
const compareFgts = compareRentVsBuy(
  { ...compareBase, fgts: { currentBalance: 30000, monthlyYieldPercent: 0 } },
  { ...compareDefaults, fgtsMonthlyContribution: 100 },
);
assert.equal(compareFgts.initialPortfolio, 0);
assert.ok(Math.abs(compareFgts.buyerFgts - 11200) < 0.01);
assert.ok(Math.abs(compareFgts.renterFgts - 31200) < 0.01);
assert.ok(Math.abs(compareFgts.buyerFgtsLeftover - 11200) < 0.01);
assert.ok(Math.abs(compareFgts.scenarios[0].buyerNetWorth - 111200) < 0.01);

// FGTS do comprador acompanha o saldo FGTS do cronograma quando o plano de amortização está ativo
const planFinancing = {
  ...noFeeBase,
  fgts: { currentBalance: 0, monthlyYieldPercent: 0, extraordinaryAmortization: { monthlyContribution: 300, annualRaisePercent: 0 } },
};
const planSchedule = calculateSchedule(planFinancing);
const planCompare = compareRentVsBuy(planFinancing, { ...compareDefaults, horizonMonths: 36, fgtsMonthlyContribution: 300 });
planCompare.rows.forEach((row, index) => {
  assert.ok(Math.abs(row.buyerFgts - planSchedule.rows[index].fgtsBalance) < 1e-6);
  assert.ok(Math.abs(row.debtBalance - planSchedule.rows[index].balance) < 1e-6);
});

console.log('Financing checks passed.');
