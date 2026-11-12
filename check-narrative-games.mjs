import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {App} from './static/core/app.mjs';
import {MemoryStore} from './static/core/store.mjs';
import {serializeProgress,restoreProgress} from './static/core/progress.mjs';
import {documentModel,Element} from './tests/fake-dom.mjs';
const require=createRequire(import.meta.url),{Session,validate}=require('./static/core/model.js');
const orderPack=require('./static/content/washing.json'),findPack=require('./static/content/park.json');
async function until(condition,label='condition'){for(let i=0;i<200;i++){if(condition())return;await new Promise(r=>setTimeout(r));}assert(condition(),label);}
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
  await target().fire();await click(root,'找到了');assert.equal(store.events.size,0);
  await click(root,'听听要找什么');assert(s.heard);await target().fire();assert(!s.done);await click(root,'找到了');assert(s.done);assert.equal([...store.events.values()][0].payload.mode,'scene_find_game');
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

// Like core/player.js: a new play() stops the previous one, which resolves false. manual: plays wait until resolved.
async function hearFixture(pack,{manual=false}={}){globalThis.document=documentModel();const root=new Element('main'),store=new MemoryStore(),played=[],waiting=[];let n=0;
  const player={stop(){for(const r of waiting.splice(0))r(false);},source:'local-file',play(path){player.stop();played.push(path);return manual?new Promise(r=>waiting.push(r)):Promise.resolve(true);}};
  const app=new App({root,pack,store,Session,uuid:()=>String(++n),player});await app.init();app.open('game');return {root,app,store,s:app.stateFor('game'),played,waiting};}
for(const [name,pack,label] of [['scene-find',findPack,w=>'选择'+w.cn],['listen-pack',require('./static/content/picnic.json'),w=>w.cn]]){
  test(name+': tapping a picture plays its word and only selects; 找到了 submits the selection',async()=>{
    const {root,app,store,s,played}=await hearFixture(pack),q=pack.modules.game.questions[0],tile=id=>root.querySelectorAll('button').find(b=>b.attributes['aria-label']===label(app.word(id))),found=()=>root.querySelectorAll('button').find(b=>b.textContent==='找到了');
    const wrong=q.options.find(o=>o!==q.target),path=id=>app.asset(app.word(id).audio).path;
    assert(found().disabled,'disabled while nothing is selected');
    await tile(wrong).fire();assert.deepEqual(played,[path(wrong)]);assert.equal(s.selection,wrong);assert.equal(tile(wrong).attributes['aria-pressed'],'true');assert(!found().disabled,'enabled once something is selected');assert.equal(store.events.size,0);
    await click(root,'听听要找什么');assert(s.heard);assert.equal(played.at(-1),path(q.target));assert.equal(s.selection,wrong);assert(!found().disabled);
    await tile(q.target).fire();assert.equal(played.at(-1),path(q.target));assert.equal(s.selection,q.target);assert.equal(tile(wrong).attributes['aria-pressed'],'false');assert.equal(tile(q.target).attributes['aria-pressed'],'true');assert(!s.done);assert.equal(store.events.size,0);
    await found().fire();assert(s.done);assert.equal(store.events.size,1);
    const n=played.length,events=store.events.size;await tile(wrong).fire();assert.equal(played.length,n+1);assert.equal(played.at(-1),path(wrong));assert.equal(s.selection,q.target);assert(s.done);assert.equal(store.events.size,events);
  });
  test(name+': 找到了 on a wrong selection keeps the wrong-answer path',async()=>{
    const {root,app,store,s}=await hearFixture(pack),q=pack.modules.game.questions[0],wrong=q.options.find(o=>o!==q.target);
    await click(root,'听听要找什么');await root.querySelectorAll('button').find(b=>b.attributes['aria-label']===label(app.word(wrong))).fire();await click(root,'找到了');
    assert(!s.done);assert.equal(s.attempts,1);assert.equal(store.events.size,1);
  });
  test(name+': tapping a picture during the target prompt plays the tapped word; the target counts as not heard',async()=>{
    const {root,app,store,s,played,waiting}=await hearFixture(pack,{manual:true}),q=pack.modules.game.questions[0],tile=id=>root.querySelectorAll('button').find(b=>b.attributes['aria-label']===label(app.word(id))),path=id=>app.asset(app.word(id).audio).path;
    const wrong=q.options.find(o=>o!==q.target),prompt=root.querySelectorAll('button').find(b=>b.textContent==='听听要找什么').fire();await until(()=>waiting.length===1);assert.equal(played.at(-1),path(q.target));
    const tap=tile(wrong).fire();await prompt;await new Promise(r=>setTimeout(r,5));
    assert.equal(played.at(-1),path(wrong));assert.equal(waiting.length,1,'the tapped word is still playing');assert.equal(s.heard,false);assert.equal(s.selection,wrong);
    assert(!root.querySelectorAll('button').find(b=>b.textContent==='找到了').disabled,'找到了 stays usable');assert.equal(store.events.size,0);waiting.shift()(true);await tap;
  });
  test(name+': 找到了 before the target was heard plays the target prompt and does not submit',async()=>{
    const {root,app,store,s,played,waiting}=await hearFixture(pack,{manual:true}),q=pack.modules.game.questions[0],tile=id=>root.querySelectorAll('button').find(b=>b.attributes['aria-label']===label(app.word(id))),found=()=>root.querySelectorAll('button').find(b=>b.textContent==='找到了'),path=id=>app.asset(app.word(id).audio).path;
    const tap=tile(q.target).fire();await until(()=>waiting.length===1);waiting.shift()(true);await tap;assert(!found().disabled);
    const press=found().fire();await until(()=>waiting.length===1,'the prompt plays');assert.equal(played.at(-1),path(q.target));assert(!s.done);assert.equal(store.events.size,0);
    assert(root.querySelector('#message').textContent.includes('先听完要找的词'),root.querySelector('#message').textContent);
    waiting.shift()(true);await press;assert(s.heard);assert.equal(s.selection,q.target);await found().fire();assert(s.done);assert.equal(store.events.size,1);
  });
  test(name+': after Momo 示范 the demo mark stays on the demo tile, not on the child\'s own later pick',async()=>{
    const {root,app,s}=await hearFixture(pack),q=pack.modules.game.questions[0],tile=id=>root.querySelectorAll('button').find(b=>b.attributes['aria-label']===label(app.word(id))),wrong=q.options.find(o=>o!==q.target);
    await click(root,name==='listen-pack'?'Momo 示范':'请朋友示范');assert.equal(s.selection,q.target);
    await tile(wrong).fire();await click(root,'听听要找什么');assert.equal(s.selection,wrong);
    assert(!root.textContent.includes('Momo 示范✓')&&!tile(wrong).textContent.includes('Momo 示范'),tile(wrong).textContent);assert(!tile(wrong).className.includes('demo-hotspot'));
    if(name==='listen-pack')assert(tile(wrong).textContent.includes('已选中'));else assert(tile(wrong).className.includes('highlight'));
  });
}
test('listen-pack and scene-find instructions say: tap a picture to hear it, then press 找到了',async()=>{
  const catalog=require('./static/content/catalog.json');let seen=0;
  for(const file of Object.values(catalog.scenes)){const pack=require('./static/'+file),type=pack.modules.game?.type;if(!['listen-pack','scene-find'].includes(type))continue;seen++;
    const {root}=await hearFixture(pack);await click(root,type==='listen-pack'?'看看怎么玩':'听听怎么玩');const text=root.querySelector('.module-guide').textContent;
    assert(text.includes('听一听')&&text.includes('找到了')&&!text.includes('再点对应图片'),pack.sceneId+': '+text);
    if(type==='scene-find')assert(root.textContent.includes('选好了点“找到了”'),pack.sceneId+' on-screen text');}
  assert.equal(seen,7);
});
