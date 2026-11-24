/* Undo and redo over opaque state snapshots (strings). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.HP = root.HP || {}).history = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // limit is the number of undo steps kept, not counting the current state.
  function createHistory(limit) {
    const max = limit > 0 ? limit : 100;
    let stack = [];
    let index = -1;

    return {
      reset(state) { stack = [state]; index = 0; },

      // Returns false when nothing changed, so idle commits do not add steps.
      push(state) {
        if (index >= 0 && stack[index] === state) return false;
        stack = stack.slice(0, index + 1);
        stack.push(state);
        if (stack.length > max + 1) stack.shift();
        index = stack.length - 1;
        return true;
      },

      // Overwrites the newest step, used to merge a burst of nudges into one undo.
      replace(state) {
        if (index < 1) return this.push(state);
        stack = stack.slice(0, index + 1);
        stack[index] = state;
        return true;
      },

      undo() { return index > 0 ? stack[--index] : null; },
      redo() { return index < stack.length - 1 ? stack[++index] : null; },
      canUndo() { return index > 0; },
      canRedo() { return index < stack.length - 1; },
      undoSteps() { return Math.max(0, index); }
    };
  }

  return { createHistory };
});
