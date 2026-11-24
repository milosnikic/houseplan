const test = require('node:test');
const assert = require('node:assert/strict');
const { createHistory } = require('../src/history.js');

test('undo and redo walk the stack', () => {
  const h = createHistory();
  h.reset('a');
  assert.equal(h.canUndo(), false);
  assert.equal(h.undo(), null);
  h.push('b');
  h.push('c');
  assert.equal(h.undo(), 'b');
  assert.equal(h.undo(), 'a');
  assert.equal(h.undo(), null);
  assert.equal(h.redo(), 'b');
  assert.equal(h.redo(), 'c');
  assert.equal(h.redo(), null);
});

test('a new change after undo drops the redo branch', () => {
  const h = createHistory();
  h.reset('a');
  h.push('b');
  h.push('c');
  h.undo();
  h.push('d');
  assert.equal(h.canRedo(), false);
  assert.equal(h.undo(), 'b');
  assert.equal(h.redo(), 'd');
});

test('pushing an unchanged state adds no step', () => {
  const h = createHistory();
  h.reset('a');
  assert.equal(h.push('a'), false);
  assert.equal(h.push('b'), true);
  assert.equal(h.push('b'), false);
  assert.equal(h.undoSteps(), 1);
});

test('keeps at least 50 undo steps', () => {
  const h = createHistory(100);
  h.reset('s0');
  for (let i = 1; i <= 60; i++) h.push('s' + i);
  for (let i = 59; i >= 0; i--) assert.equal(h.undo(), 's' + i);
  assert.equal(h.undo(), null);
  for (let i = 1; i <= 60; i++) assert.equal(h.redo(), 's' + i);
});

test('older steps fall off past the limit', () => {
  const h = createHistory(50);
  h.reset('s0');
  for (let i = 1; i <= 80; i++) h.push('s' + i);
  assert.equal(h.undoSteps(), 50);
  let last = null, steps = 0;
  for (let s = h.undo(); s !== null; s = h.undo()) { last = s; steps++; }
  assert.equal(steps, 50);
  assert.equal(last, 's30');
});

test('replace merges into the newest step', () => {
  const h = createHistory();
  h.reset('a');
  h.push('b');
  h.replace('c');
  assert.equal(h.undoSteps(), 1);
  assert.equal(h.undo(), 'a');
  assert.equal(h.redo(), 'c');
  const fresh = createHistory();
  fresh.reset('a');
  fresh.replace('b');                 // nothing to merge into yet, so it becomes a step
  assert.equal(fresh.undo(), 'a');
});
