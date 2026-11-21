import test from 'node:test';
import assert from 'node:assert/strict';
import { playbackSnapshot, selectPlayback } from '../core.js';
test('playback snapshots freeze queues and history instead of retaining mutable arrays', () => {
  const state = { currentId: 'b', queue: ['a','b'], queueOrder: ['a','b'], history: ['a'], shuffle: true, repeat: 'all' };
  const snapshot = playbackSnapshot(state, 42.125, 10);
  state.queue.reverse(); state.history.push('b');
  assert.deepEqual(snapshot.queue, ['a','b']);
  assert.deepEqual(snapshot.history, ['a']);
  assert.equal(snapshot.position, 42.125);
  assert.equal(snapshot.savedAt, 10);
});
test('synchronous unload checkpoint wins over an older uncommitted IndexedDB checkpoint', () => {
  const stored = { currentId: 'a', position: 4, savedAt: 100 };
  const emergency = { currentId: 'b', position: 19, savedAt: 101 };
  assert.equal(selectPlayback(stored, emergency), emergency);
  assert.equal(selectPlayback(emergency, stored), emergency);
  assert.equal(selectPlayback(stored, { currentId: 'a', position: -1, savedAt: 200 }), stored);
  assert.equal(selectPlayback(stored, 'broken'), stored);
  assert.equal(selectPlayback({ currentId: 'a', position: 5 }, null).position, 5);
});
