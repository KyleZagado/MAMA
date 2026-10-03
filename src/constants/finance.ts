import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import type { Account, Transaction } from '../types/models';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export const ACCOUNT_TYPES: {
  id: Account['type'];
  label: string;
  icon: IconName;
  background: string;
  foreground: string;
}[] = [
  { id: 'bank', label: 'Bank', icon: 'briefcase-outline', background: '#E0E9FB', foreground: '#2D5BD0' },
  { id: 'ewallet', label: 'E-Wallet', icon: 'card-outline', background: '#DDF6E8', foreground: '#1F8F5A' },
  { id: 'cash', label: 'Cash', icon: 'cash-outline', background: '#FDF1CC', foreground: '#A87608' },
  { id: 'credit_card', label: 'Credit card', icon: 'card', background: '#F1E4FA', foreground: '#8A3FB8' },
  { id: 'custom', label: 'Other', icon: 'wallet-outline', background: '#EAEEF2', foreground: '#51606E' },
];

export function accountTypeInfo(type: Account['type']) {
  return ACCOUNT_TYPES.find((item) => item.id === type) ?? ACCOUNT_TYPES[ACCOUNT_TYPES.length - 1];
}

export const TRANSACTION_TYPES: { id: Transaction['type']; label: string }[] = [
  { id: 'expense', label: 'Expense' },
  { id: 'income', label: 'Income' },
  { id: 'transfer', label: 'Transfer' },
];

export const CATEGORIES: {
  id: string;
  label: string;
  icon: IconName;
  kind: 'expense' | 'income';
}[] = [
  { id: 'groceries', label: 'Groceries', icon: 'cart-outline', kind: 'expense' },
  { id: 'food', label: 'Food & drink', icon: 'cafe-outline', kind: 'expense' },
  { id: 'transport', label: 'Transport', icon: 'car-outline', kind: 'expense' },
  { id: 'bills', label: 'Bills', icon: 'receipt-outline', kind: 'expense' },
  { id: 'shopping', label: 'Shopping', icon: 'bag-outline', kind: 'expense' },
  { id: 'entertainment', label: 'Entertainment', icon: 'film-outline', kind: 'expense' },
  { id: 'health', label: 'Health', icon: 'medkit-outline', kind: 'expense' },
  { id: 'other_expense', label: 'Other', icon: 'ellipsis-horizontal-outline', kind: 'expense' },
  { id: 'salary', label: 'Salary', icon: 'briefcase-outline', kind: 'income' },
  { id: 'gift', label: 'Gift', icon: 'gift-outline', kind: 'income' },
  { id: 'other_income', label: 'Other', icon: 'ellipsis-horizontal-outline', kind: 'income' },
];

export function categoryInfo(id: string | null) {
  return CATEGORIES.find((item) => item.id === id) ?? null;
}
