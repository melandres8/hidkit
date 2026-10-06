import assert from 'node:assert/strict';
import test from 'node:test';
import { MESSAGES } from '../src/messages.mjs';

test('the notFound message exists', () => {
  assert.equal(typeof MESSAGES.notFound, 'string');
});
