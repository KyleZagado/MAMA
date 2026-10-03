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
  { id: 'food', label: 'Food', icon: 'restaurant-outline', kind: 'expense' },
  { id: 'groceries', label: 'Groceries', icon: 'cart-outline', kind: 'expense' },
  { id: 'housing', label: 'Housing', icon: 'home-outline', kind: 'expense' },
  { id: 'transport', label: 'Transportation', icon: 'car-outline', kind: 'expense' },
  { id: 'bills', label: 'Bills', icon: 'receipt-outline', kind: 'expense' },
  { id: 'shopping', label: 'Shopping', icon: 'bag-outline', kind: 'expense' },
  { id: 'entertainment', label: 'Entertainment', icon: 'film-outline', kind: 'expense' },
  { id: 'health', label: 'Health', icon: 'medkit-outline', kind: 'expense' },
  { id: 'education', label: 'Education', icon: 'school-outline', kind: 'expense' },
  { id: 'travel', label: 'Travel', icon: 'airplane-outline', kind: 'expense' },
  { id: 'family', label: 'Family', icon: 'people-outline', kind: 'expense' },
  { id: 'debt', label: 'Debt', icon: 'card-outline', kind: 'expense' },
  { id: 'savings', label: 'Savings', icon: 'save-outline', kind: 'expense' },
  { id: 'other_expense', label: 'Other', icon: 'ellipsis-horizontal-outline', kind: 'expense' },
  { id: 'salary', label: 'Salary', icon: 'briefcase-outline', kind: 'income' },
  { id: 'freelance', label: 'Freelance', icon: 'laptop-outline', kind: 'income' },
  { id: 'business', label: 'Business', icon: 'storefront-outline', kind: 'income' },
  { id: 'allowance', label: 'Allowance', icon: 'wallet-outline', kind: 'income' },
  { id: 'commission', label: 'Commission', icon: 'pricetag-outline', kind: 'income' },
  { id: 'investments', label: 'Investments', icon: 'trending-up-outline', kind: 'income' },
  { id: 'gift', label: 'Gifts', icon: 'gift-outline', kind: 'income' },
  { id: 'other_income', label: 'Other', icon: 'ellipsis-horizontal-outline', kind: 'income' },
];

export const SUBCATEGORIES: Record<string, readonly string[]> = {
  food: ['Restaurants', 'Fast food', 'Coffee', 'Delivery', 'Snacks'],
  groceries: ['Supermarket', 'Produce', 'Household supplies'],
  housing: ['Rent', 'Mortgage', 'Maintenance', 'Furniture'],
  transport: ['Fuel', 'Public transit', 'Taxi / ride share', 'Parking'],
  bills: ['Electricity', 'Water', 'Internet', 'Phone', 'Subscriptions'],
  entertainment: ['Games', 'Movies', 'Events', 'Hobbies'],
  shopping: ['Clothes', 'Electronics', 'Personal care'],
  health: ['Medicine', 'Doctor', 'Dental', 'Fitness'],
  education: ['Tuition', 'Books', 'Courses'],
  travel: ['Flights', 'Accommodation', 'Activities'],
  family: ['Children', 'Parents', 'Pets', 'Gifts'],
  debt: ['Loan payment', 'Credit card payment', 'Interest'],
  savings: ['Emergency fund', 'Investments', 'Goal contribution'],
  other_expense: ['Fees', 'Donations', 'Miscellaneous'],
};

export const PAYMENT_METHODS = ['Cash', 'Debit card', 'Credit card', 'GCash', 'Maya', 'Bank transfer', 'Other'] as const;

export function categoryInfo(id: string | null) {
  return CATEGORIES.find((item) => item.id === id) ?? null;
}
