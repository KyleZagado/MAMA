import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Account, Transaction } from '../types/models';

export type Wallet = Account & { balance_minor: number };
export type TransactionItem = Transaction & { wallet_name: string; to_wallet_name: string | null };

const GOAL_KEY = 'savings_goal_minor';

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
    `SELECT t.*, a.name AS wallet_name, b.name AS to_wallet_name
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id AND a.deleted_at IS NULL
     LEFT JOIN accounts b ON b.id = t.to_account_id
     WHERE t.deleted_at IS NULL
     ORDER BY t.occurred_at DESC, t.created_at DESC
     LIMIT ?`,
    limit,
  );
}

type TransactionInput = {
  type: Transaction['type'];
  amountMinor: number;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  description: string;
};

export async function addTransaction(db: SQLiteDatabase, input: TransactionInput) {
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO transactions
       (id, type, amount_minor, account_id, to_account_id, category_id, occurred_at, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    input.type,
    input.amountMinor,
    input.accountId,
    input.type === 'transfer' ? input.toAccountId : null,
    input.type === 'transfer' ? null : input.categoryId,
    now,
    input.description || null,
    now,
    now,
  );
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
