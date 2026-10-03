const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource, database, removeTaskV10Schema } = require('./helpers/database.cjs');

const { migrate } = loadSource('src/database/migrations.ts');
const { addTransaction, deleteTransaction, deleteWallet, getWallet, saveWallet, getWalletSummary, listWalletTransactions, listTransactions, listWallets, getMonthlyFinanceSummary } = loadSource('src/database/finance.ts');
const { addIncomeSchedule, listIncomeSchedules, listExpectedIncome, confirmIncome, getIncomeTotals, listIncomeHistory, removeIncomeSchedule } = loadSource('src/database/income.ts');
const { incomeDates, incomePeriod } = loadSource('src/lib/income-recurrence.ts');
const { parseMoney } = loadSource('src/lib/money.ts');

async function seed(db) {
  await migrate(db);
  for (const [id, name] of [['cash', 'Cash'], ['gcash', 'GCash']]) {
    await db.runAsync(
      `INSERT INTO accounts (id, name, type, currency, opening_balance_minor, created_at, updated_at)
       VALUES (?, ?, 'cash', 'PHP', 100000, 1, 1)`, id, name,
    );
  }
}

test('fresh migration adds every expense field and is repeatable', async () => {
  const { native, db } = database();
  try {
    await migrate(db);
    await migrate(db);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 13);
    const columns = (await db.getAllAsync('PRAGMA table_info(transactions)')).map((row) => row.name);
    for (const name of ['subcategory', 'merchant', 'notes', 'location', 'payment_method', 'attachment_uri', 'tags']) {
      assert.ok(columns.includes(name), `Missing ${name}`);
    }
  } finally { native.close(); }
});

test('version 7 upgrade preserves existing transactions and defaults new fields to null', async () => {
  const { native, db } = database();
  try {
    await seed(db);
    removeTaskV10Schema(native);
    for (const name of ['subcategory', 'merchant', 'location', 'payment_method', 'tags']) {
      native.exec(`ALTER TABLE transactions DROP COLUMN ${name}`);
    }
    native.exec('PRAGMA user_version = 7');
    await db.runAsync(
      `INSERT INTO transactions (id, type, amount_minor, account_id, occurred_at, description, created_at, updated_at)
       VALUES ('old', 'expense', 35000, 'gcash', 1, 'Lunch', 1, 1)`,
    );
    await migrate(db);
    const [row] = await listTransactions(db, 10);
    assert.equal(row.description, 'Lunch');
    assert.equal(row.amount_minor, 35000);
    assert.equal(row.merchant, null);
    assert.equal(row.tags, null);
  } finally { native.close(); }
});

test('all expense details survive save and reload, including selected historical date', async () => {
  const { native, db } = database();
  try {
    await seed(db);
    const occurredAt = new Date(2025, 9, 3, 12, 30).getTime();
    await addTransaction(db, {
      type: 'expense', amountMinor: 35000, accountId: 'gcash', toAccountId: null,
      categoryId: 'food', description: 'Jollibee', occurredAt, merchant: 'Jollibee',
      subcategory: 'Fast food', notes: 'Team lunch', location: 'Quezon City',
      paymentMethod: 'GCash', receiptPhoto: 'receipt.jpg', tags: ['lunch', 'work'],
    });
    const [row] = await listTransactions(db, 10);
    assert.equal(row.occurred_at, occurredAt);
    assert.equal(row.category_id, 'food');
    assert.equal(row.subcategory, 'Fast food');
    assert.equal(row.merchant, 'Jollibee');
    assert.equal(row.notes, 'Team lunch');
    assert.equal(row.location, 'Quezon City');
    assert.equal(row.payment_method, 'GCash');
    assert.equal(row.attachment_uri, 'receipt.jpg');
    assert.deepEqual(JSON.parse(row.tags), ['lunch', 'work']);
    assert.equal(row.wallet_name, 'GCash');
    assert.equal((await listWallets(db)).find((wallet) => wallet.id === 'gcash').balance_minor, 65000);
    assert.equal((await getMonthlyFinanceSummary(db)).expensesMinor, 0);
  } finally { native.close(); }
});

test('quick entry requires no optional metadata and preserves income and transfer behavior', async () => {
  const { native, db } = database();
  try {
    await seed(db);
    const base = { accountId: 'cash', toAccountId: null, categoryId: null, description: '' };
    await addTransaction(db, { ...base, type: 'expense', amountMinor: 100 });
    await addTransaction(db, { ...base, type: 'income', amountMinor: 200 });
    await addTransaction(db, { ...base, type: 'transfer', amountMinor: 500, toAccountId: 'gcash', categoryId: 'food' });
    const rows = await listTransactions(db, 10);
    const transfer = rows.find((row) => row.type === 'transfer');
    assert.equal(transfer.category_id, null);
    assert.equal(transfer.to_wallet_name, 'GCash');
    assert.ok(rows.every((row) => row.tags === null && row.attachment_uri === null));
    const wallets = await listWallets(db);
    assert.equal(wallets.find((wallet) => wallet.id === 'cash').balance_minor, 99600);
    assert.equal(wallets.find((wallet) => wallet.id === 'gcash').balance_minor, 100500);
    const summary = await getMonthlyFinanceSummary(db);
    assert.equal(summary.incomeMinor, 200);
    assert.equal(summary.expensesMinor, 100);
  } finally { native.close(); }
});

test('amount parsing rejects invalid or unsafe values and preserves minor units', () => {
  assert.equal(parseMoney('350'), 35000);
  assert.equal(parseMoney('12.50'), 1250);
  assert.equal(parseMoney('1,234.56'), 123456);
  for (const value of ['-1', '12.345', 'abc', '', '1000000000']) {
    assert.equal(parseMoney(value), null);
  }
});

test('15th and 30th salary handles short months, leap years and start dates', () => {
  const schedule = { frequency: 'semimonthly', startDate: '2024-01-20', monthDays: [15, 30] };
  assert.deepEqual(incomeDates(schedule, '2024-01-01', '2024-03-31'),
    ['2024-01-30', '2024-02-15', '2024-02-29', '2024-03-15', '2024-03-30']);
  assert.deepEqual(incomeDates(schedule, '2025-02-01', '2025-02-28'), ['2025-02-15', '2025-02-28']);
  assert.throws(() => incomeDates({ ...schedule, monthDays: [30, 31] }, '2025-02-01', '2025-02-28'), /overlap/);
  assert.throws(() => incomeDates({ ...schedule, monthDays: [15, 15] }, '2025-02-01', '2025-02-28'), /distinct/);
});

test('weekly, biweekly, monthly and annual pay schedules maintain calendar anchors', () => {
  const base = { startDate: '2025-03-01', monthDays: [] };
  assert.deepEqual(incomeDates({ ...base, frequency: 'weekly' }, '2025-03-09', '2025-03-31'),
    ['2025-03-15', '2025-03-22', '2025-03-29']);
  assert.deepEqual(incomeDates({ ...base, frequency: 'biweekly' }, '2025-03-09', '2025-03-31'),
    ['2025-03-15', '2025-03-29']);
  assert.deepEqual(incomeDates({ frequency: 'monthly', startDate: '2025-01-31', monthDays: [31] },
    '2025-01-01', '2025-04-30'), ['2025-01-31', '2025-02-28', '2025-03-31', '2025-04-30']);
  assert.deepEqual(incomeDates({ frequency: 'annual', startDate: '2024-02-29', monthDays: [] },
    '2024-01-01', '2026-12-31'), ['2024-02-29', '2025-02-28', '2026-02-28']);
});

test('version 8 upgrades without altering saved expense metadata', async () => {
  const { native, db } = database();
  try {
    await seed(db);
    removeTaskV10Schema(native);
    native.exec('DROP TABLE income_receipts; DROP TABLE income_schedules; PRAGMA user_version = 8');
    await addTransaction(db, { type: 'expense', amountMinor: 100, accountId: 'cash',
      toAccountId: null, categoryId: 'food', description: '', merchant: 'Lunch shop' });
    await migrate(db);
    assert.equal((await db.getFirstAsync('PRAGMA user_version')).user_version, 13);
    assert.equal((await listTransactions(db, 10))[0].merchant, 'Lunch shop');
    assert.deepEqual(await listIncomeSchedules(db), []);
  } finally { native.close(); }
});

test('expected income never credits balance; confirmation is once per due date and reversible', async () => {
  const { native, db } = database();
  try {
    await seed(db);
    const id = await addIncomeSchedule(db, { name: 'Employer', amountMinor: 1500000,
      accountId: 'cash', categoryId: 'salary', frequency: 'semimonthly',
      startDate: '2024-01-01', monthDays: [15, 30] });
    const other = await addIncomeSchedule(db, { name: 'Side job', amountMinor: 10000,
      accountId: 'gcash', categoryId: 'freelance', frequency: 'monthly',
      startDate: '2024-01-01', monthDays: [15] });
    assert.equal((await listExpectedIncome(db, '2024-01-01', '2024-01-31')).length, 3);
    assert.equal((await listWallets(db))[0].balance_minor, 100000);
    const input = { scheduleId: id, dueDate: '2024-01-15', amountMinor: 1400000,
      receivedAt: new Date(2024, 0, 16, 12).getTime() };
    await confirmIncome(db, input);
    await assert.rejects(confirmIncome(db, input), /already been received/);
    await assert.rejects(confirmIncome(db, { ...input, dueDate: '2024-01-14' }), /not part/);
    await assert.rejects(confirmIncome(db, { ...input, dueDate: '2099-01-15' }), /not due/);
    await assert.rejects(confirmIncome(db, { ...input, amountMinor: 0 }), /positive amount/);
    const history = await listIncomeHistory(db, new Date(2024, 0, 1).getTime(), new Date(2024, 1, 1).getTime());
    assert.equal(history.length, 1);
    assert.equal(history[0].description, 'Employer');
    assert.equal(history[0].amount_minor, 1400000);
    assert.equal(history[0].occurred_at, input.receivedAt);
    assert.equal((await listWallets(db))[0].balance_minor, 1500000);
    assert.equal((await listExpectedIncome(db, '2024-01-01', '2024-01-31')).filter((item) => item.received).length, 1);
    await deleteTransaction(db, history[0].id);
    assert.equal((await listExpectedIncome(db, '2024-01-01', '2024-01-31')).filter((item) => item.received).length, 0);
    await confirmIncome(db, input);
    assert.equal((await listWallets(db))[0].balance_minor, 1500000);
    await removeIncomeSchedule(db, id);
    assert.equal((await listIncomeHistory(db, 0, Date.now())).length, 1);
    assert.equal((await listIncomeSchedules(db)).length, 1);
    await deleteWallet(db, 'gcash');
    await assert.rejects(confirmIncome(db, { ...input, scheduleId: other }), /no longer available/);
    assert.deepEqual(await listIncomeSchedules(db), []);
  } finally { native.close(); }
});

test('income totals include every source and page, use actual receipt dates and exclude transfers/deletions', async () => {
  const { native, db } = database();
  try {
    await seed(db);
    const base = { accountId: 'cash', toAccountId: null, categoryId: 'business', description: 'Sale' };
    for (let i = 0; i < 55; i++) {
      await addTransaction(db, { ...base, type: 'income', amountMinor: 100, occurredAt: new Date(2024, 11, 31, 12).getTime() });
    }
    await addTransaction(db, { ...base, type: 'income', amountMinor: 200, occurredAt: new Date(2025, 0, 1).getTime() });
    const deleted = await addTransaction(db, { ...base, type: 'income', amountMinor: 900, occurredAt: new Date(2024, 11, 1).getTime() });
    await deleteTransaction(db, deleted);
    await addTransaction(db, { ...base, type: 'transfer', amountMinor: 500, toAccountId: 'gcash', occurredAt: new Date(2024, 11, 1).getTime() });
    const year = incomePeriod(new Date(2024, 11, 1), true);
    const month = incomePeriod(new Date(2025, 0, 1));
    assert.deepEqual((await getIncomeTotals(db, year.startAt, year.endAt)).currencies, [{ currency: 'PHP', totalMinor: 5500 }]);
    assert.deepEqual((await getIncomeTotals(db, year.startAt, year.endAt)).categories.map((row) => ({ ...row })),
      [{ category_id: 'business', currency: 'PHP', amount_minor: 5500 }]);
    assert.deepEqual((await getIncomeTotals(db, month.startAt, month.endAt)).currencies, [{ currency: 'PHP', totalMinor: 200 }]);
    const first = await listIncomeHistory(db, year.startAt, year.endAt);
    const second = await listIncomeHistory(db, year.startAt, year.endAt, first.length);
    assert.equal(first.length, 50);
    assert.equal(second.length, 5);
    assert.equal(new Set([...first, ...second].map((row) => row.id)).size, 55);
  } finally { native.close(); }
});

test('income totals never combine different currencies', async () => {
  const { native, db } = database();
  try {
    await seed(db);
    await db.runAsync("UPDATE accounts SET currency = 'USD' WHERE id = 'gcash'");
    for (const accountId of ['cash', 'gcash']) {
      await addTransaction(db, { type: 'income', amountMinor: 100, accountId,
        toAccountId: null, categoryId: 'salary', description: 'Salary' });
    }
    assert.deepEqual((await getIncomeTotals(db, 0, Date.now() + 1)).currencies,
      [{ currency: 'PHP', totalMinor: 100 }, { currency: 'USD', totalMinor: 100 }]);
    const history = await listIncomeHistory(db, 0, Date.now() + 1);
    assert.equal(history.find((item) => item.account_id === 'gcash').wallet_currency, 'USD');
    assert.equal((await listTransactions(db, 10)).find((item) => item.account_id === 'cash').wallet_currency, 'PHP');
  } finally { native.close(); }
});

test('failed receipt linking rolls back the deposit', async () => {
  const { native, db } = database();
  try {
    await seed(db);
    const id = await addIncomeSchedule(db, { name: 'Salary', amountMinor: 10000,
      accountId: 'cash', categoryId: 'salary', frequency: 'monthly',
      startDate: '2024-01-01', monthDays: [15] });
    native.exec(`CREATE TRIGGER fail_receipt BEFORE INSERT ON income_receipts
      BEGIN SELECT RAISE(ABORT, 'receipt write failure'); END`);
    await assert.rejects(confirmIncome(db, { scheduleId: id, dueDate: '2024-01-15',
      amountMinor: 10000, receivedAt: new Date(2024, 0, 15).getTime() }), /receipt write failure/);
    assert.equal((await listTransactions(db, 10)).length, 0);
    assert.equal((await listWallets(db))[0].balance_minor, 100000);
  } finally { native.close(); }
});

test('each wallet has independent income, expenses and bidirectional transfer history', async () => {
  const { native, db } = database();
  try {
    await seed(db);
    const base = { toAccountId: null, categoryId: null, description: '' };
    const income = await addTransaction(db, { ...base, type: 'income', accountId: 'cash', amountMinor: 20000 });
    await addTransaction(db, { ...base, type: 'expense', accountId: 'cash', amountMinor: 3000 });
    await addTransaction(db, { ...base, type: 'income', accountId: 'gcash', amountMinor: 5000 });
    await addTransaction(db, { ...base, type: 'expense', accountId: 'gcash', amountMinor: 1000 });
    const transfer = await addTransaction(db, { ...base, type: 'transfer', accountId: 'cash', toAccountId: 'gcash', amountMinor: 4000 });
    await addTransaction(db, { ...base, type: 'transfer', accountId: 'gcash', toAccountId: 'cash', amountMinor: 500 });
    assert.deepEqual({ ...await getWalletSummary(db, 'cash') }, {
      income_minor: 20000, expenses_minor: 3000, transfers_in_minor: 500, transfers_out_minor: 4000,
    });
    assert.deepEqual({ ...await getWalletSummary(db, 'gcash') }, {
      income_minor: 5000, expenses_minor: 1000, transfers_in_minor: 4000, transfers_out_minor: 500,
    });
    assert.equal((await getWallet(db, 'cash')).balance_minor, 113500);
    assert.equal((await getWallet(db, 'gcash')).balance_minor, 107500);
    for (const id of ['cash', 'gcash']) {
      assert.equal((await listWalletTransactions(db, id)).length, 4);
      assert.equal((await listWalletTransactions(db, id, 'income')).length, 1);
      assert.equal((await listWalletTransactions(db, id, 'expense')).length, 1);
      const transfers = await listWalletTransactions(db, id, 'transfer');
      assert.equal(transfers.length, 2);
      assert.equal(transfers.find((row) => row.id === transfer).to_wallet_name, 'GCash');
    }
    await deleteTransaction(db, transfer);
    assert.equal((await getWallet(db, 'cash')).balance_minor, 117500);
    assert.equal((await getWallet(db, 'gcash')).balance_minor, 103500);
    assert.equal((await listWalletTransactions(db, 'cash', 'transfer')).length, 1);
    assert.equal((await getWalletSummary(db, 'gcash')).transfers_in_minor, 0);
    await deleteTransaction(db, income);
    assert.equal((await getWalletSummary(db, 'cash')).income_minor, 0);
    await assert.rejects(getWalletSummary(db, 'missing'), /no longer available/);
  } finally { native.close(); }
});

test('wallet history pagination and balance adjustments preserve complete independent totals', async () => {
  const { native, db } = database();
  try {
    await seed(db);
    for (let i = 0; i < 55; i++) {
      await addTransaction(db, { type: 'expense', amountMinor: 100, accountId: 'cash',
        toAccountId: null, categoryId: 'food', description: '' });
    }
    await addTransaction(db, { type: 'expense', amountMinor: 900, accountId: 'gcash',
      toAccountId: null, categoryId: 'food', description: '' });
    const first = await listWalletTransactions(db, 'cash', 'expense');
    const second = await listWalletTransactions(db, 'cash', 'expense', first.length);
    assert.equal(first.length, 50);
    assert.equal(second.length, 5);
    assert.equal(new Set([...first, ...second].map((item) => item.id)).size, 55);
    assert.equal((await getWalletSummary(db, 'cash')).expenses_minor, 5500);
    await saveWallet(db, { id: 'cash', name: 'Cash', type: 'cash', currency: 'PHP', details: '', balanceMinor: 200000 });
    assert.equal((await getWallet(db, 'cash')).balance_minor, 200000);
    assert.equal((await getWalletSummary(db, 'cash')).expenses_minor, 5500);
    assert.equal((await getWallet(db, 'gcash')).balance_minor, 99100);
    await deleteWallet(db, 'cash');
    assert.equal(await getWallet(db, 'cash'), null);
    assert.deepEqual(await listWalletTransactions(db, 'cash'), []);
    await assert.rejects(getWalletSummary(db, 'cash'), /no longer available/);
    assert.equal((await listWalletTransactions(db, 'gcash')).length, 1);
  } finally { native.close(); }
});
