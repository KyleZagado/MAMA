const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource } = require('./helpers/database.cjs');

const { DEFAULT_HOME_PAGE_ORDER, moveHomePage, normalizeHomePageOrder } =
  loadSource('src/constants/home-pages.ts');

test('home page order normalization retains valid unique pages and appends new pages', () => {
  assert.deepEqual(normalizeHomePageOrder(['fasting', 'fitness', 'fasting', 'unknown']), [
    'fasting',
    'fitness',
    'finance',
    'todos',
    'consumption',
  ]);
  assert.deepEqual(normalizeHomePageOrder(null), DEFAULT_HOME_PAGE_ORDER);
});

test('moving home pages supports arbitrary positions and boundaries', () => {
  const order = [...DEFAULT_HOME_PAGE_ORDER];
  assert.deepEqual(moveHomePage(order, 'finance', 4), [
    'todos',
    'consumption',
    'fitness',
    'fasting',
    'finance',
  ]);
  assert.deepEqual(moveHomePage(order, 'fasting', 0), [
    'fasting',
    'finance',
    'todos',
    'consumption',
    'fitness',
  ]);
  assert.deepEqual(moveHomePage(order, 'finance', 0), order);
  assert.deepEqual(moveHomePage(order, 'finance', 99), [
    'todos',
    'consumption',
    'fitness',
    'fasting',
    'finance',
  ]);
});
