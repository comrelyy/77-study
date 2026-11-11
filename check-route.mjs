import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {routeOrder,levelStates,canEnter,mapDays,flatRoute} from './static/core/route.mjs';
import {availableScenes,chooseScene} from './static/core/catalog.mjs';
const catalog=createRequire(import.meta.url)('./static/content/catalog.json');
const ORDER=['washing','dressing','breakfast','weather','transport','park','picnic','shopping','gardening','cooking','tidy','birthday','bedtime'];
const ICONS=['toothbrush','shirt','egg','sun','bus','tree','basket','bag','flower','pot','car','cup','bed'];
test('routeOrder follows the fixed route and appends scenes outside it',()=>{
  assert.deepEqual(routeOrder(catalog),ORDER);
  assert.deepEqual(catalog.days[0].route.map(r=>r.icon),ICONS);
  assert.deepEqual(catalog.days[0].route.map(r=>r.band),[0,0,0,1,1,1,2,3,3,4,4,5,5]);
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
test('days: day 1 keeps the 13-level route and order',()=>{
  assert.equal(catalog.days[0].id,'everyday');assert.equal(catalog.days[0].title,'普通的一天');assert.equal(catalog.days[0].approved,true);
  assert.deepEqual(catalog.days[0].route.map(r=>r.icon),ICONS);assert.deepEqual(routeOrder(catalog),ORDER);assert.equal(catalog.route,undefined);
});
test('unapproved days stay off the map and cannot be entered',()=>{
  const zoo={...catalog,scenes:{...catalog.scenes,'zoo-gate':'content/zoo-gate.json'},previewScenes:[...catalog.previewScenes,'zoo-gate'],
    days:[...catalog.days,{id:'zoo',title:'去动物园',approved:false,route:[{id:'zoo-gate',band:0,icon:'ticket'}]}]};
  assert.deepEqual(routeOrder(zoo),ORDER);assert(!availableScenes(zoo).includes('zoo-gate'));
  assert.throws(()=>chooseScene(zoo,null,'zoo-gate'));assert.deepEqual(mapDays(zoo).map(d=>d.id),['everyday']);
  const ok={...zoo,days:[catalog.days[0],{...zoo.days[1],approved:true}]};
  assert.deepEqual(routeOrder(ok),[...ORDER,'zoo-gate']);assert(availableScenes(ok).includes('zoo-gate'));
  assert.deepEqual(flatRoute(zoo).map(r=>r.dayId).at(-1),'zoo');
});
test('modules changed for the days feature are imported with the new cache version',async()=>{
  const {readdir,readFile}=await import('node:fs/promises');const dir=new URL('./static/',import.meta.url),files=(await readdir(dir,{recursive:true})).filter(f=>f.endsWith('.mjs')&&!f.startsWith('content'));
  const bad=[];for(const f of files)for(const m of (await readFile(new URL(f,dir),'utf8')).matchAll(/from\s+'([^']*\/(?:catalog|route|day-map|diary)\.mjs[^']*)'/g))if(!m[1].endsWith('?v=days-zoo-20261111'))bad.push(f+': '+m[1]);
  assert.deepEqual(bad,[]);
});
