const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource } = require('./helpers/database.cjs');

const {
  DEFAULT_HOME_PAGE_ORDER,
  moveHomePage,
  normalizeHiddenHomePages,
  normalizeHomePageOrder,
  toggleHiddenHomePage,
} = loadSource('src/constants/home-pages.ts');

test('home page order normalization retains valid unique pages and appends new pages', () => {
  assert.deepEqual(normalizeHomePageOrder(['fasting', 'fitness', 'fasting', 'unknown']), [
    'fasting',
    'fitness',
    'overview',
    'todos',
    'finance',
    'consumption',
    'journal',
  ]);
  assert.deepEqual(normalizeHomePageOrder(null), DEFAULT_HOME_PAGE_ORDER);
  assert.deepEqual(DEFAULT_HOME_PAGE_ORDER, [
    'overview',
    'todos',
    'finance',
    'consumption',
    'fitness',
    'fasting',
    'journal',
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
    'journal',
  ]);
  assert.deepEqual(moveHomePage(order, 'fasting', 0), [
    'fasting',
    'overview',
    'todos',
    'finance',
    'consumption',
    'fitness',
    'journal',
  ]);
  assert.deepEqual(moveHomePage(order, 'finance', 2), order);
  assert.deepEqual(moveHomePage(order, 'finance', 99), [
    'overview',
    'todos',
    'consumption',
    'fitness',
    'fasting',
    'journal',
    'finance',
  ]);
});

test('hidden home pages are normalized and always leave one page visible', () => {
  assert.deepEqual(normalizeHiddenHomePages(['journal', 'unknown', 'finance', 'journal']), [
    'finance',
    'journal',
  ]);
  assert.deepEqual(normalizeHiddenHomePages(null), []);
  assert.equal(normalizeHiddenHomePages(DEFAULT_HOME_PAGE_ORDER).length, DEFAULT_HOME_PAGE_ORDER.length - 1);

  assert.deepEqual(toggleHiddenHomePage([], 'fasting'), ['fasting']);
  assert.deepEqual(toggleHiddenHomePage(['fasting', 'journal'], 'fasting'), ['journal']);
  const allButOne = DEFAULT_HOME_PAGE_ORDER.slice(1);
  assert.equal(toggleHiddenHomePage(allButOne, 'overview'), allButOne);
});
