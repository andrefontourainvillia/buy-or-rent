export const TR_API_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.226/dados/ultimos/1?formato=json';
export const TR_FALLBACK = {
  monthlyPercent: 0.1692,
  startDate: '27/08/2026',
  endDate: '27/09/2026',
} as const;

export const ENTRY_PERCENT_MIN = 20;
export const ENTRY_PERCENT_MAX = 100;

// FGTS rende TR do período + 3% a.a. (Lei 8.036/1990), linear = 0,25% a.m.
export const FGTS_MONTHLY_YIELD_BONUS = 0.25;
export const FGTS_AMORTIZATION_INTERVAL_MONTHS = 24;

export type TrReference = {
  monthlyPercent: number;
  startDate: string;
  endDate: string;
};

export type ScheduleRow = {
  n: number;
  due: string;
  openingBalance: number;
  correctedBalance: number;
  payment: number;
  amort: number;
  interest: number;
  correction: number;
  mip: number;
  dfi: number;
  fee: number;
  total: number;
  realAmortization: number;
  balance: number;
  fgtsDeposit: number;
  fgtsBalance: number;
  fgtsAmortization: number;
};

export type FgtsExtraordinaryAmortization = {
  monthlyContribution: number;
  annualRaisePercent: number;
};

export type FgtsInputs = {
  currentBalance: number;
  monthlyYieldPercent: number;
  extraordinaryAmortization?: FgtsExtraordinaryAmortization;
};

export type FinancingInputs = {
  property: number;
  down: number;
  months: number;
  annualNominalRate: number;
  trMonthlyPercent: number;
  mipMonthlyPercent: number;
  dfiMonthlyPercent: number;
  monthlyFee: number;
  firstDue: string;
  fgts?: FgtsInputs;
};

export const shouldApplyAutomaticTr = (wasEditedManually: boolean) => !wasEditedManually;

export const formatFinancingPeriod = (months: number) => {
  const totalMonths = Math.max(0, Math.round(months));
  const years = Math.floor(totalMonths / 12);
  const remainingMonths = totalMonths % 12;
  const yearLabel = `${years} ${years === 1 ? 'ano' : 'anos'}`;
  const monthLabel = `${remainingMonths} ${remainingMonths === 1 ? 'mês' : 'meses'}`;
  if (years && remainingMonths) return `${yearLabel} e ${monthLabel}`;
  return years ? yearLabel : monthLabel;
};

export const formatFinancingPeriodWithMonths = (months: number) => {
  const totalMonths = Math.max(0, Math.round(months));
  const monthLabel = `${totalMonths} ${totalMonths === 1 ? 'mês' : 'meses'}`;
  return `${formatFinancingPeriod(totalMonths)} ("${monthLabel}")`;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

export const entryFromPercent = (property: number, percent: number) => {
  const price = Math.max(0, property);
  const normalizedPercent = clamp(percent, ENTRY_PERCENT_MIN, ENTRY_PERCENT_MAX);
  return roundCurrency(price * normalizedPercent / 100);
};

export const normalizeEntryAmount = (property: number, entry: number) => {
  const price = Math.max(0, property);
  return roundCurrency(clamp(entry, entryFromPercent(price, ENTRY_PERCENT_MIN), price));
};

export const entryPercentFromAmount = (property: number, entry: number) => {
  const price = Math.max(0, property);
  if (price === 0) return ENTRY_PERCENT_MIN;
  return normalizeEntryAmount(price, entry) / price * 100;
};

export const computeFgtsMonthlyRate = (trMonthlyPercent: number) => Math.max(0, trMonthlyPercent) + FGTS_MONTHLY_YIELD_BONUS;

export const clampFgtsToEntry = (entry: number, fgtsCurrentBalance: number) =>
  Math.min(Math.max(0, entry), Math.max(0, fgtsCurrentBalance));

const brDate = (iso: string, offset: number) => {
  const [year, month, day] = iso.split('-').map(Number);
  const targetMonth = month - 1 + offset;
  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  const date = new Date(Date.UTC(year, targetMonth, Math.min(day, lastDay)));
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date);
};

const isValidBrDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return false;
  const [day, month, year] = value.split('/').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export function parseBcbTrPayload(payload: unknown): TrReference {
  if (!Array.isArray(payload) || payload.length !== 1 || !payload[0] || typeof payload[0] !== 'object') {
    throw new Error('Resposta da TR em formato inválido.');
  }

  const item = payload[0] as Record<string, unknown>;
  const monthlyPercent = Number(item.valor);
  if (
    !Number.isFinite(monthlyPercent) ||
    monthlyPercent < 0 ||
    monthlyPercent > 20 ||
    !isValidBrDate(item.data) ||
    !isValidBrDate(item.dataFim)
  ) {
    throw new Error('Valores da TR inválidos.');
  }

  return { monthlyPercent, startDate: item.data, endDate: item.dataFim };
}

export async function fetchTrReference(
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  init?: RequestInit,
): Promise<{ source: 'bcb'; reference: TrReference } | { source: 'fallback'; reference: null }> {
  try {
    const response = await fetcher(TR_API_URL, init);
    if (!response.ok) {
      throw new Error('Não foi possível consultar a TR.');
    }

    const payload = await response.json();
    return { source: 'bcb', reference: parseBcbTrPayload(payload) };
  } catch {
    return { source: 'fallback', reference: null };
  }
}

export function calculateSchedule(inputs: FinancingInputs) {
  const price = Math.max(0, inputs.property);
  const entry = normalizeEntryAmount(price, inputs.down);
  const financed = price - entry;
  const term = clamp(Math.round(inputs.months), 1, 420);
  const monthlyRate = Math.max(0, inputs.annualNominalRate) / 100 / 12;
  const trMonthly = Math.max(0, inputs.trMonthlyPercent) / 100;
  const fgtsAmortizationPlan = inputs.fgts?.extraordinaryAmortization;
  const fgtsYieldMonthly = Math.max(0, inputs.fgts?.monthlyYieldPercent ?? 0) / 100;
  let balance = financed;
  let fgtsAccrued = 0;
  const rows: ScheduleRow[] = [];

  for (let i = 1; i <= term; i += 1) {
    const remainingMonths = term - i + 1;
    const openingBalance = balance;
    const correction = openingBalance * trMonthly;
    let correctedBalance = openingBalance + correction;

    let fgtsAmortization = 0;
    let fgtsDeposit = 0;
    if (fgtsAmortizationPlan) {
      const raiseCycles = Math.floor((i - 1) / 12);
      const monthlyContribution = fgtsAmortizationPlan.monthlyContribution
        * Math.pow(1 + Math.max(0, fgtsAmortizationPlan.annualRaisePercent) / 100, raiseCycles);
      fgtsDeposit = Math.max(0, monthlyContribution);
      fgtsAccrued = fgtsAccrued * (1 + fgtsYieldMonthly) + fgtsDeposit;
      if (i % FGTS_AMORTIZATION_INTERVAL_MONTHS === 0) {
        fgtsAmortization = Math.min(fgtsAccrued, correctedBalance);
        correctedBalance -= fgtsAmortization;
        fgtsAccrued = Math.max(0, fgtsAccrued - fgtsAmortization);
      }
    }

    const amort = remainingMonths === 1 ? correctedBalance : correctedBalance / remainingMonths;
    const interest = correctedBalance * monthlyRate;
    const mip = correctedBalance * Math.max(0, inputs.mipMonthlyPercent) / 100;
    const dfi = price * Math.max(0, inputs.dfiMonthlyPercent) / 100;
    const fee = Math.max(0, inputs.monthlyFee);
    const payment = amort + interest;
    const total = payment + mip + dfi + fee;
    balance = Math.max(0, correctedBalance - amort);
    const realAmortization = openingBalance - balance;
    rows.push({
      n: i,
      due: brDate(inputs.firstDue, i - 1),
      openingBalance,
      correctedBalance,
      payment,
      amort,
      interest,
      correction,
      mip,
      dfi,
      fee,
      total,
      realAmortization,
      balance,
      fgtsDeposit,
      fgtsBalance: fgtsAccrued,
      fgtsAmortization,
    });

    if (balance <= 0) break;
  }

  const totals = rows.reduce(
    (acc, row) => ({
      payments: acc.payments + row.payment,
      interest: acc.interest + row.interest,
      insurance: acc.insurance + row.mip + row.dfi,
      fees: acc.fees + row.fee,
      correction: acc.correction + row.correction,
      total: acc.total + row.total,
      fgtsAmortization: acc.fgtsAmortization + row.fgtsAmortization,
    }),
    { payments: 0, interest: 0, insurance: 0, fees: 0, correction: 0, total: 0, fgtsAmortization: 0 },
  );

  return {
    price,
    entry,
    financed,
    term: rows.length,
    rows,
    totals,
    monthlyRate,
    initialAmort: rows[0]?.amort ?? 0,
    effective: (Math.pow(1 + monthlyRate, 12) - 1) * 100,
  };
}
