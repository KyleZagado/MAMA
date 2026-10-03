const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource } = require('./helpers/database.cjs');

const { DEFAULT_HOME_PAGE_ORDER, moveHomePage, normalizeHomePageOrder } =
  loadSource('src/constants/home-pages.ts');

test('home page order normalization retains valid unique pages and appends new pages', () => {
  assert.deepEqual(normalizeHomePageOrder(['fasting', 'fitness', 'fasting', 'unknown']), [
    'fasting',
    'fitness',
    'overview',
    'todos',
    'finance',
    'consumption',
  ]);
  assert.deepEqual(normalizeHomePageOrder(null), DEFAULT_HOME_PAGE_ORDER);
  assert.deepEqual(DEFAULT_HOME_PAGE_ORDER, [
    'overview',
    'todos',
    'finance',
    'consumption',
    'fitness',
    'fasting',
  ]);
});

test('moving home pages supports arbitrary positions and boundaries', () => {
  const order = [...DEFAULT_HOME_PAGE_ORDER];
  assert.deepEqual(moveHomePage(order, 'finance', 4), [
    'overview',
    'todos',
    'consumption',
    'fitness',
    'finance',
    'fasting',
  ]);
  assert.deepEqual(moveHomePage(order, 'fasting', 0), [
    'fasting',
    'overview',
    'todos',
    'finance',
    'consumption',
    'fitness',
  ]);
  assert.deepEqual(moveHomePage(order, 'finance', 2), order);
  assert.deepEqual(moveHomePage(order, 'finance', 99), [
    'overview',
    'todos',
    'consumption',
    'fitness',
    'fasting',
    'finance',
  ]);
});
