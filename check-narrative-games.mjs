import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {App} from './static/core/app.mjs';
import {MemoryStore} from './static/core/store.mjs';
import {serializeProgress,restoreProgress} from './static/core/progress.mjs';
import {documentModel,Element} from './tests/fake-dom.mjs';
const require=createRequire(import.meta.url),{Session,validate}=require('./static/core/model.js');
const orderPack=require('./static/content/washing.json'),findPack=require('./static/content/park.json');
const click=(root,text)=>{const b=root.querySelectorAll('button').find(b=>b.textContent===text);assert(b,'missing button '+text);return b.fire();};
async function fixture(pack){globalThis.document=documentModel();const root=new Element('main'),store=new MemoryStore();let n=0;
  const app=new App({root,pack,store,Session,uuid:()=>String(++n),player:{stop(){},async play(){return true;}}});await app.init();app.open('game');return {root,app,store,s:app.stateFor('game')};}

test('ordering requires a whole sequence, supports undo, records actual attempts and restores partial work',async()=>{
  const {root,app,store,s}=await fixture(orderPack),q=orderPack.modules.game.questions[0];
  assert.equal(await s.confirm(),false);assert.equal(store.events.size,0);
  s.select(q.solution[1]);assert.equal(await s.confirm(),false);assert.equal(s.select(q.solution[1]),false);
  s.select(q.solution[0]);s.select(q.solution[2]);assert(await s.confirm());assert.equal(s.done,false);assert.equal(s.attempts,1);
  assert.equal([...store.events.values()][0].payload.matched,false);
  while(s.undoSequence()){};s.select(q.solution[0]);
  const saved=serializeProgress(orderPack,'game',s),fresh=new Session(orderPack);fresh.enter('game');
  assert(restoreProgress(orderPack,'game',fresh,{...saved,compatible:true}));assert.deepEqual(fresh.sequence,[q.solution[0]]);
  s.select(q.solution[1]);s.select(q.solution[2]);app.draw();await click(root,'故事排好了');
  assert(s.done);assert.equal(store.events.size,2);assert.equal(s.attempts,2);
  const event=[...store.events.values()][1];assert.equal(event.payload.mode,'story_order_game');assert.deepEqual(event.payload.sequenceOrder,q.solution);
});

test('ordering demonstration and undo never create participation before explicit confirmation',async()=>{
  const {root,store,s}=await fixture(orderPack);await click(root,'请朋友示范');assert.equal(store.events.size,0);assert(s.demoUsed);
  assert.equal(s.sequence.length,3);await click(root,'撤回最后一步');assert.equal(store.events.size,0);assert.equal(s.sequence.length,2);
  const q=orderPack.modules.game.questions[0];await click(root,q.labels[q.solution[2]]);await click(root,'故事排好了');assert.equal(store.events.size,1);assert.equal([...store.events.values()][0].payload.hinted,true);
});

test('scene search uses spatial targets, gates answers on listening and cannot reuse stale heard state',async()=>{
  const {root,app,store,s}=await fixture(findPack),q=findPack.modules.game.questions[0];
  assert.equal(root.querySelectorAll('.game-hotspot').length,4);assert(root.querySelector('.find-scene-art'));
  const target=()=>root.querySelectorAll('button').find(b=>b.attributes['aria-label']==='选择'+app.word(q.target).cn);
  await target().fire();assert.equal(store.events.size,0);
  await click(root,'听听要找什么');assert(s.heard);await target().fire();assert(s.done);assert.equal([...store.events.values()][0].payload.mode,'scene_find_game');
  await click(root,'继续');assert.equal(s.heard,false);assert.equal(s.index,1);
  const saved=serializeProgress(findPack,'game',s),fresh=new Session(findPack);fresh.enter('game');fresh.heard=true;
  assert(restoreProgress(findPack,'game',fresh,{...saved,compatible:true}));assert.equal(fresh.heard,false);
});

test('malformed sequence solutions, duplicate saved selections, or missing scene targets are rejected',()=>{
  const order=structuredClone(orderPack);order.modules.game.questions[0].solution.fill(order.modules.game.questions[0].options[0]);assert(validate(order).errors.length);
  const find=structuredClone(findPack);find.modules.game.hotspots.pop();assert(validate(find).errors.some(e=>e.includes('hotspot')));
  const s=new Session(orderPack);s.enter('game');const progress=serializeProgress(orderPack,'game',s);progress.state.sequenceOrder=[orderPack.modules.game.questions[0].solution[0],orderPack.modules.game.questions[0].solution[0]];
  progress.state.selectedId=progress.state.sequenceOrder[0];assert.equal(restoreProgress(orderPack,'game',s,{...progress,compatible:true}),false);
});
