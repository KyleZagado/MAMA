import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { addDaysToKey, fromDateKey, toDateKey } from '../lib/dates';
import type { Account, Transaction } from '../types/models';

export type Wallet = Account & { balance_minor: number };
export type TransactionItem = Transaction & { wallet_name: string; wallet_currency: string; to_wallet_name: string | null };
export type BillItem = {
  id: string;
  name: string;
  amount_minor: number;
  due_date: string;
};

export type MonthlyFinanceSummary = {
  incomeMinor: number;
  expensesMinor: number;
  savingsMinor: number;
  budgetMinor: number | null;
  spendingStreak: number;
  bills: BillItem[];
};

const GOAL_KEY = 'savings_goal_minor';
const MONTHLY_BUDGET_KEY = 'monthly_budget_minor';

const WALLET_SELECT = `
  SELECT a.*,
    a.opening_balance_minor + COALESCE(SUM(CASE
      WHEN t.type = 'income' AND t.account_id = a.id THEN t.amount_minor
      WHEN t.type = 'expense' AND t.account_id = a.id THEN -t.amount_minor
      WHEN t.type = 'transfer' AND t.account_id = a.id THEN -t.amount_minor
      WHEN t.type = 'transfer' AND t.to_account_id = a.id THEN t.amount_minor
      ELSE 0 END), 0) AS balance_minor
  FROM accounts a
  LEFT JOIN transactions t
    ON (t.account_id = a.id OR t.to_account_id = a.id) AND t.deleted_at IS NULL
  WHERE a.deleted_at IS NULL`;

export function listWallets(db: SQLiteDatabase) {
  return db.getAllAsync<Wallet>(`${WALLET_SELECT} GROUP BY a.id ORDER BY a.created_at ASC`);
}

export function getWallet(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<Wallet>(`${WALLET_SELECT} AND a.id = ? GROUP BY a.id`, id);
}

export type WalletHistoryFilter = 'all' | Transaction['type'];
export type WalletSummary = {
  income_minor: number;
  expenses_minor: number;
  transfers_in_minor: number;
  transfers_out_minor: number;
};

export async function getWalletSummary(db: SQLiteDatabase, id: string) {
  const summary = await db.getFirstAsync<WalletSummary>(
    `SELECT
       COALESCE(SUM(CASE WHEN t.type = 'income' AND t.account_id = a.id THEN t.amount_minor ELSE 0 END), 0) AS income_minor,
       COALESCE(SUM(CASE WHEN t.type = 'expense' AND t.account_id = a.id THEN t.amount_minor ELSE 0 END), 0) AS expenses_minor,
       COALESCE(SUM(CASE WHEN t.type = 'transfer' AND t.to_account_id = a.id THEN t.amount_minor ELSE 0 END), 0) AS transfers_in_minor,
       COALESCE(SUM(CASE WHEN t.type = 'transfer' AND t.account_id = a.id THEN t.amount_minor ELSE 0 END), 0) AS transfers_out_minor
     FROM accounts a LEFT JOIN transactions t
       ON (t.account_id = a.id OR t.to_account_id = a.id) AND t.deleted_at IS NULL
     WHERE a.id = ? AND a.deleted_at IS NULL GROUP BY a.id`, id,
  );
  if (!summary) throw new Error('This wallet is no longer available.');
  return summary;
}

export function listWalletTransactions(
  db: SQLiteDatabase, id: string, filter: WalletHistoryFilter = 'all', offset = 0,
) {
  return db.getAllAsync<TransactionItem>(
    `SELECT t.*, a.name AS wallet_name, a.currency AS wallet_currency, b.name AS to_wallet_name
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id AND a.deleted_at IS NULL
     LEFT JOIN accounts b ON b.id = t.to_account_id
     WHERE t.deleted_at IS NULL AND
       (t.account_id = ? OR (t.type = 'transfer' AND t.to_account_id = ? AND b.deleted_at IS NULL))
       AND (? = 'all' OR t.type = ?)
     ORDER BY t.occurred_at DESC, t.created_at DESC, t.id DESC LIMIT 50 OFFSET ?`,
    id, id, filter, filter, offset,
  );
}

type WalletInput = {
  id?: string;
  name: string;
  type: Account['type'];
  currency: string;
  details: string;
  balanceMinor: number;
};

export async function saveWallet(db: SQLiteDatabase, input: WalletInput) {
  const now = Date.now();
  const details = input.details || null;
  const existing = input.id ? await getWallet(db, input.id) : null;

  if (existing) {
    // The entered balance is the current balance, so shift the opening balance by the difference.
    const opening = input.balanceMinor - (existing.balance_minor - existing.opening_balance_minor);
    await db.runAsync(
      'UPDATE accounts SET name = ?, type = ?, details = ?, opening_balance_minor = ?, updated_at = ? WHERE id = ?',
      input.name,
      input.type,
      details,
      opening,
      now,
      existing.id,
    );
    return existing.id;
  }

  const id = randomUUID();
  await db.runAsync(
    `INSERT INTO accounts (id, name, type, currency, opening_balance_minor, details, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.name,
    input.type,
    input.currency,
    input.balanceMinor,
    details,
    now,
    now,
  );
  return id;
}

export async function deleteWallet(db: SQLiteDatabase, id: string) {
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE deleted_at IS NULL AND (account_id = ? OR to_account_id = ?)',
      now,
      now,
      id,
      id,
    );
    await db.runAsync('UPDATE accounts SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
  });
}

export function listTransactions(db: SQLiteDatabase, limit: number) {
  return db.getAllAsync<TransactionItem>(
    `SELECT t.*, a.name AS wallet_name, a.currency AS wallet_currency, b.name AS to_wallet_name
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id AND a.deleted_at IS NULL
     LEFT JOIN accounts b ON b.id = t.to_account_id
     WHERE t.deleted_at IS NULL
     ORDER BY t.occurred_at DESC, t.created_at DESC
     LIMIT ?`,
    limit,
  );
}

export async function getMonthlyFinanceSummary(db: SQLiteDatabase): Promise<MonthlyFinanceSummary> {
  const today = toDateKey(new Date());
  const monthStart = fromDateKey(today);
  monthStart.setDate(1);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);
  const startAt = monthStart.getTime();
  const endAt = monthEnd.getTime();
  const streakSince = fromDateKey(addDaysToKey(today, -370)).getTime();

  const [totals, budget, bills, expenseDates] = await Promise.all([
    db.getFirstAsync<{ income_minor: number; expenses_minor: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount_minor ELSE 0 END), 0) AS income_minor,
         COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_minor ELSE 0 END), 0) AS expenses_minor
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id AND a.deleted_at IS NULL
       WHERE t.deleted_at IS NULL AND t.occurred_at >= ? AND t.occurred_at < ?
         AND t.type IN ('income', 'expense')`,
      startAt,
      endAt,
    ),
    db.getFirstAsync<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      MONTHLY_BUDGET_KEY,
    ),
    db.getAllAsync<BillItem>(
      `SELECT id, name, amount_minor, due_date
       FROM bills
       WHERE deleted_at IS NULL AND paid_at IS NULL AND due_date >= ? AND due_date <= ?
       ORDER BY due_date ASC
       LIMIT 5`,
      today,
      addDaysToKey(today, 30),
    ),
    db.getAllAsync<{ occurred_at: number }>(
      `SELECT occurred_at FROM transactions
       WHERE deleted_at IS NULL AND type = 'expense' AND occurred_at >= ?
       ORDER BY occurred_at DESC`,
      streakSince,
    ),
  ]);

  let spendingStreak = 0;
  const yesterday = addDaysToKey(today, -1);
  const expenseDayKeys = new Set(expenseDates.map(({ occurred_at }) => toDateKey(new Date(occurred_at))));
  let streakDay = expenseDayKeys.has(today) ? today : yesterday;
  while (expenseDayKeys.has(streakDay)) {
    spendingStreak += 1;
    streakDay = addDaysToKey(streakDay, -1);
  }

  const incomeMinor = totals?.income_minor ?? 0;
  const expensesMinor = totals?.expenses_minor ?? 0;
  const parsedBudget = budget ? Number(budget.value) : 0;

  return {
    incomeMinor,
    expensesMinor,
    savingsMinor: incomeMinor - expensesMinor,
    budgetMinor: Number.isSafeInteger(parsedBudget) && parsedBudget > 0 ? parsedBudget : null,
    spendingStreak,
    bills,
  };
}

export async function setMonthlyBudget(db: SQLiteDatabase, budgetMinor: number | null) {
  if (budgetMinor === null) {
    await db.runAsync('DELETE FROM settings WHERE key = ?', MONTHLY_BUDGET_KEY);
    return;
  }
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    MONTHLY_BUDGET_KEY,
    String(budgetMinor),
  );
}

export async function addBill(
  db: SQLiteDatabase,
  input: { name: string; amountMinor: number; dueDate: string },
) {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO bills (id, name, amount_minor, due_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    input.name,
    input.amountMinor,
    input.dueDate,
    now,
    now,
  );
}

export async function markBillPaid(db: SQLiteDatabase, id: string) {
  const now = Date.now();
  await db.runAsync('UPDATE bills SET paid_at = ?, updated_at = ? WHERE id = ?', now, now, id);
}

export async function deleteBill(db: SQLiteDatabase, id: string) {
  const now = Date.now();
  await db.runAsync('UPDATE bills SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
}

type TransactionInput = {
  type: Transaction['type'];
  amountMinor: number;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  description: string;
  occurredAt?: number;
  subcategory?: string | null;
  merchant?: string | null;
  notes?: string | null;
  location?: string | null;
  paymentMethod?: string | null;
  receiptPhoto?: string | null;
  tags?: string[];
};

export async function addTransaction(db: SQLiteDatabase, input: TransactionInput) {
  const now = Date.now();
  const id = randomUUID();
  await db.runAsync(
    `INSERT INTO transactions
       (id, type, amount_minor, account_id, to_account_id, category_id, occurred_at, description,
        subcategory, merchant, notes, location, payment_method, attachment_uri, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.type,
    input.amountMinor,
    input.accountId,
    input.type === 'transfer' ? input.toAccountId : null,
    input.type === 'transfer' ? null : input.categoryId,
    input.occurredAt ?? now,
    input.description || null,
    input.type === 'expense' ? input.subcategory ?? null : null,
    input.type === 'expense' ? input.merchant ?? null : null,
    input.notes ?? null,
    input.location ?? null,
    input.paymentMethod ?? null,
    input.receiptPhoto ?? null,
    input.tags?.length ? JSON.stringify(input.tags) : null,
    now,
    now,
  );
  return id;
}

export function deleteTransaction(db: SQLiteDatabase, id: string) {
  const now = Date.now();
  return db.runAsync('UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, id);
}

export async function getSavingsGoal(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', GOAL_KEY);
  const value = row ? Number(row.value) : 0;
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function setSavingsGoal(db: SQLiteDatabase, goalMinor: number | null) {
  if (goalMinor === null) {
    await db.runAsync('DELETE FROM settings WHERE key = ?', GOAL_KEY);
  } else {
    await db.runAsync(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      GOAL_KEY,
      String(goalMinor),
    );
  }
}

// Net income minus expenses over the last 30 days; transfers move money between wallets.
export async function getRecentNetChange(db: SQLiteDatabase) {
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const row = await db.getFirstAsync<{ net: number }>(
    `SELECT COALESCE(SUM(CASE t.type
        WHEN 'income' THEN t.amount_minor
        WHEN 'expense' THEN -t.amount_minor
        ELSE 0 END), 0) AS net
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id AND a.deleted_at IS NULL
     WHERE t.deleted_at IS NULL AND t.occurred_at >= ?`,
    since,
  );
  return row?.net ?? 0;
}
