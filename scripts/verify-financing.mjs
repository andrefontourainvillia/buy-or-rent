import assert from 'node:assert/strict';
import {
  calculateSchedule,
  entryFromPercent,
  entryPercentFromAmount,
  fetchTrReference,
  formatFinancingPeriod,
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

console.log('Financing checks passed.');
