const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadSource } = require('./helpers/database.cjs');

const { bmiCategory, bodyMassIndex, profileHeightCm, profileWeightKg } =
  loadSource('src/lib/body-metrics.ts');

const session = (metadata) => ({ user: { user_metadata: metadata } });

test('profile body metrics read positive numbers only', () => {
  assert.equal(profileWeightKg(session({ weight_kg: 72.5 })), 72.5);
  assert.equal(profileHeightCm(session({ height_cm: '180' })), 180);
  assert.equal(profileWeightKg(session({ weight_kg: '' })), null);
  assert.equal(profileHeightCm(session({ height_cm: 0 })), null);
  assert.equal(profileWeightKg(session({})), null);
});

test('BMI is calculated and categorized', () => {
  assert.equal(bodyMassIndex(70, 175), 22.9);
  assert.equal(bodyMassIndex(70, null), null);
  assert.equal(bmiCategory(17), 'Underweight');
  assert.equal(bmiCategory(22.9), 'Healthy');
  assert.equal(bmiCategory(27), 'Overweight');
  assert.equal(bmiCategory(31), 'Obese');
});
