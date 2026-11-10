import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStorage} from './static/core/store.mjs';
import {resetPreviewLeftovers} from './static/core/preview-reset.mjs';
const filled=()=>{const s=new MemoryStorage();s.setItem('momo.v3.pending.a','{}');s.setItem('momo.v3.active-lease','{}');s.setItem('other','keep');return s;};
const keys=s=>Array.from({length:s.length},(_,i)=>s.key(i)).sort();
test('household state leaves local records alone',()=>{
  const local=filled(),session=filled();
  assert.equal(resetPreviewLeftovers({},[local,session]),false);
  assert.deepEqual(keys(local),['momo.v3.active-lease','momo.v3.pending.a','other']);
});
test('a new preview boot clears every momo key and remembers the boot',()=>{
  const local=filled(),session=filled();session.setItem('momo.reminder.x','shown');
  assert.equal(resetPreviewLeftovers({previewId:'boot-1'},[local,session]),true);
  assert.deepEqual(keys(local),['momo.preview-id','other']);
  assert.deepEqual(keys(session),['other']);
  local.setItem('momo.v3.pending.b','{}');
  assert.equal(resetPreviewLeftovers({previewId:'boot-1'},[local,session]),false,'same boot keeps records written since');
  assert.deepEqual(keys(local),['momo.preview-id','momo.v3.pending.b','other']);
  assert.equal(resetPreviewLeftovers({previewId:'boot-2'},[local,session]),true);
  assert.deepEqual(keys(local),['momo.preview-id','other']);
});
