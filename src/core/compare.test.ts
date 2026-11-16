import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareCodeUnits } from './compare.js';

test('code-unit ordering is deterministic for paths and class-set keys', () => {
  assert.deepEqual(
    ['é', 'z', 'a', 'Z', 'A', '😀', '\uE000'].sort(compareCodeUnits),
    ['A', 'Z', 'a', 'z', 'é', '😀', '\uE000'],
  );
  assert.equal(compareCodeUnits('same', 'same'), 0);
  assert.ok(compareCodeUnits('a', 'aa') < 0);
  assert.ok(compareCodeUnits('aa', 'a') > 0);
});
