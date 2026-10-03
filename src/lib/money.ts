import { DEFAULT_CURRENCY } from '../constants/currencies';

type MoneyOptions = { currency?: string; compact?: boolean; sign?: boolean };

// Amounts are stored in hundredths, so zero- and three-decimal currencies still show two decimals.
export function formatMoney(minor: number, options: MoneyOptions = {}) {
  const currency = options.currency ?? DEFAULT_CURRENCY;
  const digits = options.compact && minor % 100 === 0 ? 0 : 2;
  const amount = Math.abs(minor) / 100;
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount);
  } catch {
    formatted = `${currency} ${amount.toFixed(digits)}`;
  }
  if (minor < 0) return `-${formatted}`;
  return options.sign && minor > 0 ? `+${formatted}` : formatted;
}

// Returns integer minor units, or null when the text is not a valid amount.
export function parseMoney(text: string, options: { allowNegative?: boolean } = {}) {
  const cleaned = text.trim().replace(/[,\s]/g, '');
  const pattern = options.allowNegative ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/;
  if (!pattern.test(cleaned)) return null;
  const minor = Math.round(Number(cleaned) * 100);
  return Number.isSafeInteger(minor) && Math.abs(minor) <= 99_999_999_999 ? minor : null;
}

export function minorToInput(minor: number) {
  const value = (minor / 100).toFixed(2);
  return value.endsWith('.00') ? value.slice(0, -3) : value;
}

export function formatWhen(timestamp: number) {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  if (timestamp >= startOfToday.getTime()) return `Today, ${time}`;
  if (timestamp >= startOfToday.getTime() - dayMs) return `Yesterday, ${time}`;
  const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day}, ${time}`;
}
