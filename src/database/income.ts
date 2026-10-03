import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { CATEGORIES } from '../constants/finance';
import { toDateKey } from '../lib/dates';
import { incomeDates, validateIncomeRecurrence, type IncomeFrequency } from '../lib/income-recurrence';
import { addTransaction, type TransactionItem } from './finance';

export type IncomeSchedule = {
  id: string;
  name: string;
  amount_minor: number;
  account_id: string;
  category_id: string;
  frequency: IncomeFrequency;
  start_date: string;
  month_days: string;
  wallet_name: string;
  currency: string;
};

export type ExpectedIncome = { schedule: IncomeSchedule; dueDate: string; received: boolean };
export type IncomeTotals = {
  currencies: { currency: string; totalMinor: number }[];
  categories: { category_id: string | null; currency: string; amount_minor: number }[];
};
export type IncomeScheduleInput = {
  name: string;
  amountMinor: number;
  accountId: string;
  categoryId: string;
  frequency: IncomeFrequency;
  startDate: string;
  monthDays: number[];
};

function recurrence(schedule: IncomeSchedule) {
  const value: unknown = JSON.parse(schedule.month_days);
  if (!Array.isArray(value) || !value.every((day): day is number => typeof day === 'number')) {
    throw new Error(`Invalid pay days for ${schedule.name}.`);
  }
  return { frequency: schedule.frequency, startDate: schedule.start_date, monthDays: value };
}

export function listIncomeSchedules(db: SQLiteDatabase) {
  return db.getAllAsync<IncomeSchedule>(
    `SELECT s.*, a.name AS wallet_name, a.currency FROM income_schedules s
     JOIN accounts a ON a.id = s.account_id AND a.deleted_at IS NULL
     WHERE s.deleted_at IS NULL ORDER BY s.created_at ASC`,
  );
}

export async function addIncomeSchedule(db: SQLiteDatabase, input: IncomeScheduleInput) {
  validateIncomeRecurrence(input);
  if (!input.name.trim()) throw new Error('Enter an income source name.');
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('Enter an amount greater than zero.');
  }
  if (!CATEGORIES.some((category) => category.id === input.categoryId && category.kind === 'income')) {
    throw new Error('Choose an income category.');
  }
  const id = randomUUID();
  const result = await db.runAsync(
    `INSERT INTO income_schedules
     (id, name, amount_minor, account_id, category_id, frequency, start_date, month_days, created_at)
     SELECT ?, ?, ?, id, ?, ?, ?, ?, ? FROM accounts WHERE id = ? AND deleted_at IS NULL`,
    id, input.name.trim(), input.amountMinor, input.categoryId, input.frequency,
    input.startDate, JSON.stringify([...input.monthDays].sort((a, b) => a - b)), Date.now(), input.accountId,
  );
  if (!result.changes) throw new Error('Choose an available wallet.');
  return id;
}

export function removeIncomeSchedule(db: SQLiteDatabase, id: string) {
  return db.runAsync('UPDATE income_schedules SET deleted_at = ? WHERE id = ?', Date.now(), id);
}

export async function listExpectedIncome(db: SQLiteDatabase, from: string, through: string): Promise<ExpectedIncome[]> {
  const [schedules, receipts] = await Promise.all([
    listIncomeSchedules(db),
    db.getAllAsync<{ schedule_id: string; due_date: string }>(
      `SELECT r.schedule_id, r.due_date FROM income_receipts r
       JOIN transactions t ON t.id = r.transaction_id AND t.deleted_at IS NULL
       WHERE r.due_date >= ? AND r.due_date <= ?`, from, through,
    ),
  ]);
  const received = new Set(receipts.map((item) => `${item.schedule_id}/${item.due_date}`));
  return schedules.flatMap((schedule) => incomeDates(recurrence(schedule), from, through).map((dueDate) => ({
    schedule, dueDate, received: received.has(`${schedule.id}/${dueDate}`),
  }))).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.schedule.name.localeCompare(b.schedule.name));
}

export async function confirmIncome(
  db: SQLiteDatabase,
  input: { scheduleId: string; dueDate: string; amountMinor: number; receivedAt: number },
) {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 ||
      !Number.isFinite(input.receivedAt) || input.receivedAt > Date.now()) {
    throw new Error('Enter a positive amount and a received date that is not in the future.');
  }
  if (input.dueDate > toDateKey(new Date())) throw new Error('This payment is not due yet.');
  await db.withExclusiveTransactionAsync(async (tx) => {
    const schedule = (await listIncomeSchedules(tx)).find((item) => item.id === input.scheduleId);
    if (!schedule) throw new Error('This income schedule or wallet is no longer available.');
    if (!incomeDates(recurrence(schedule), input.dueDate, input.dueDate).includes(input.dueDate)) {
      throw new Error('This date is not part of the pay schedule.');
    }
    const receipt = await tx.getFirstAsync<{ deleted_at: number | null }>(
      `SELECT t.deleted_at FROM income_receipts r JOIN transactions t ON t.id = r.transaction_id
       WHERE r.schedule_id = ? AND r.due_date = ?`, input.scheduleId, input.dueDate,
    );
    if (receipt && receipt.deleted_at === null) throw new Error('This payment has already been received.');
    const transactionId = await addTransaction(tx, {
      type: 'income', amountMinor: input.amountMinor, accountId: schedule.account_id,
      toAccountId: null, categoryId: schedule.category_id, description: schedule.name,
      occurredAt: input.receivedAt, notes: `Scheduled payment: ${input.dueDate}`,
    });
    await tx.runAsync(
      `INSERT INTO income_receipts (schedule_id, due_date, transaction_id) VALUES (?, ?, ?)
       ON CONFLICT(schedule_id, due_date) DO UPDATE SET transaction_id = excluded.transaction_id`,
      input.scheduleId, input.dueDate, transactionId,
    );
  });
}

export async function getIncomeTotals(db: SQLiteDatabase, startAt: number, endAt: number): Promise<IncomeTotals> {
  const categories = await db.getAllAsync<IncomeTotals['categories'][number]>(
    `SELECT t.category_id, a.currency, SUM(t.amount_minor) AS amount_minor FROM transactions t
     JOIN accounts a ON a.id = t.account_id AND a.deleted_at IS NULL
     WHERE t.type = 'income' AND t.deleted_at IS NULL AND t.occurred_at >= ? AND t.occurred_at < ?
     GROUP BY a.currency, t.category_id ORDER BY a.currency, amount_minor DESC`, startAt, endAt,
  );
  const totals = new Map<string, number>();
  for (const item of categories) totals.set(item.currency, (totals.get(item.currency) ?? 0) + item.amount_minor);
  return { currencies: [...totals].map(([currency, totalMinor]) => ({ currency, totalMinor })), categories };
}

export function listIncomeHistory(db: SQLiteDatabase, startAt: number, endAt: number, offset = 0) {
  return db.getAllAsync<TransactionItem>(
    `SELECT t.*, a.name AS wallet_name, a.currency AS wallet_currency, NULL AS to_wallet_name FROM transactions t
     JOIN accounts a ON a.id = t.account_id AND a.deleted_at IS NULL
     WHERE t.type = 'income' AND t.deleted_at IS NULL AND t.occurred_at >= ? AND t.occurred_at < ?
     ORDER BY t.occurred_at DESC, t.created_at DESC, t.id DESC LIMIT 50 OFFSET ?`,
    startAt, endAt, offset,
  );
}
