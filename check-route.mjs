import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {routeOrder,levelStates,canEnter} from './static/core/route.mjs';
const catalog=createRequire(import.meta.url)('./static/content/catalog.json');
const ORDER=['washing','dressing','breakfast','weather','transport','park','picnic','shopping','gardening','cooking','tidy','birthday','bedtime'];
const ICONS=['toothbrush','shirt','egg','sun','bus','tree','basket','bag','flower','pot','car','cup','bed'];
test('routeOrder follows the fixed route and appends scenes outside it',()=>{
  assert.deepEqual(routeOrder(catalog),ORDER);
  assert.deepEqual(catalog.route.map(r=>r.icon),ICONS);
  assert.deepEqual(catalog.route.map(r=>r.band),[0,0,0,1,1,1,2,3,3,4,4,5,5]);
  assert.deepEqual(routeOrder({...catalog,mode:'release',releasedScenes:['park','washing']}),['washing','park']);
  const zoo={...catalog,scenes:{...catalog.scenes,zoo:'content/zoo.json'},previewScenes:[...catalog.previewScenes,'zoo']};
  assert.deepEqual(routeOrder(zoo),[...ORDER,'zoo']);
});
test('levelStates unlocks one level at a time',()=>{
  const s=a=>a.map(x=>x.state);
  assert.deepEqual(s(levelStates(ORDER,new Set())),['current',...Array(12).fill('locked')]);
  assert.deepEqual(s(levelStates(ORDER,new Set(['washing','dressing']))).slice(0,4),['done','done','current','locked']);
  assert(!levelStates(ORDER,new Set(ORDER)).some(x=>x.state==='current'));
  assert(levelStates(ORDER,new Set(ORDER)).every(x=>x.state==='done'));
  assert.deepEqual(s(levelStates(ORDER,new Set(['washing']),{unlockAll:true})),['done',...Array(12).fill('current')]);
  assert.equal(levelStates(ORDER,new Set())[0].id,'washing');
});
test('canEnter allows only done and current',()=>{
  const c=new Set(['washing']);
  assert(canEnter(ORDER,c,'washing'));assert(canEnter(ORDER,c,'dressing'));assert(!canEnter(ORDER,c,'breakfast'));
  assert(canEnter(ORDER,c,'bedtime',{unlockAll:true}));assert(!canEnter(ORDER,c,'nope'));
});
