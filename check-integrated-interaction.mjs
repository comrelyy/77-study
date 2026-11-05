import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {App} from './static/core/app.mjs';
import {MemoryStore} from './static/core/store.mjs';
import {serializeProgress} from './static/core/progress.mjs';
import {pendingInteractionGame} from './static/core/interaction-flow.mjs';
import {Element,documentModel} from './tests/fake-dom.mjs';
const require=createRequire(import.meta.url),{Session}=require('./static/core/model.js'),catalog=require('./static/content/catalog.json');
const cooking=require('./static/content/cooking.json');
function button(root,label){const b=root.querySelectorAll('button').find(b=>b.textContent===label);assert(b,'missing '+label);return b;}
async function fixture(pack=cooking,store=new MemoryStore()){
  globalThis.document=documentModel();const root=new Element('main'),played=[];let id=0;
  const app=new App({root,pack,store,Session,uuid:()=>String(++id),player:{stop(){},source:'local-file',async play(path){played.push(path);return true;}}});
  await app.init();app.open('dialogue');return {app,root,store,played};
}
async function answer(root){const card=root.querySelector('.reply-card');assert(card);await card.fire();}

test('every theme alternates actual one-click conversation with its game tasks and finishes in one activity',async()=>{
  for(const file of Object.values(catalog.scenes)){
    const pack=require('./static/'+file),{app,root,store}=await fixture(pack);let safety=0;
    while(app.view==='module'&&safety++<100){
      assert.equal(app.moduleId,'dialogue');assert(!root.textContent.includes('就这样回答'));
      const dialogue=app.stateFor('dialogue'),game=app.stateFor('game');
      if(pendingInteractionGame(pack,dialogue,game)){
        assert(root.querySelector('.interaction-bridge'));const q=pack.modules.game.questions[game.index];
        if(pack.modules.game.type==='story-order'){
          for(const word of q.solution)await button(root,q.labels[word]).fire();
          await button(root,'故事排好了').fire();
        }else if(pack.modules.game.type==='scene-find'){
          await button(root,'听听要找什么').fire();
          await root.querySelectorAll('button').find(b=>b.attributes['aria-label']==='选择'+app.word(q.target).cn).fire();
        }else if(pack.modules.game.type==='listen-pack'){
          await button(root,'听听要找什么').fire();
          await root.querySelectorAll('button').find(b=>b.attributes['aria-label']===app.word(q.target).cn).fire();
        }else{
          await root.querySelectorAll('button').find(b=>b.attributes['aria-label']===app.word(q.target).cn).fire();
          await button(root,'放到'+pack.modules.game.zones.find(z=>z.id===q.zone).label).fire();
        }
        assert(game.done);await button(root,'继续').fire();
      }else await answer(root);
    }
    assert.equal(app.view,'complete',pack.sceneId+' did not finish');assert(app.stateFor('game').finished);
    const events=[...store.events.values()];
    assert.equal(events.filter(e=>e.payload.moduleId==='dialogue').length,pack.modules.dialogue.length);
    assert.equal(events.filter(e=>e.payload.moduleId==='game').length,pack.modules.game.questions.length);
    await button(root,'再玩一次').fire();assert.equal(app.stateFor('dialogue').index,0);assert.equal(app.stateFor('game').index,0);assert.equal(app.stateFor('game').finished,false);
  }
});

test('two fast clicks cannot submit two choices; an example answer never commits a choice',async()=>{
  const {app,root,store}=await fixture();await button(root,'示范回答').fire();assert.equal(store.events.size,0);assert.equal(app.stateFor('dialogue').selection,null);
  const save=store.save.bind(store);let finish,calls=0;store.save=op=>{calls++;return new Promise(resolve=>{finish=async()=>resolve(await save(op));});};
  const cards=root.querySelectorAll('.reply-card'),pending=cards[0].fire();await cards[1].fire();assert.equal(calls,1);await finish();await pending;assert.equal(store.events.size,1);assert.equal(app.stateFor('dialogue').index,1);
});

test('a saved response finishing after leaving the activity cannot play or advance another screen',async()=>{
  const {app,root,store,played}=await fixture();const save=store.save.bind(store);let finish;
  store.save=op=>new Promise(resolve=>{finish=async()=>resolve(await save(op));});
  const pending=root.querySelector('.reply-card').fire();app.home();const count=played.length;await finish();await pending;
  assert.equal(app.view,'home');assert.equal(played.length,count);assert.equal(store.events.size,1);assert.equal(app.stateFor('dialogue').index,0);
});

test('restoring a conversation in its sorting task preserves partial work and resumes the next sentence once',async()=>{
  const first=await fixture();for(let i=0;i<5;i++)await answer(first.root);
  const d=first.app.stateFor('dialogue'),g=first.app.stateFor('game'),q=cooking.modules.game.questions[0];
  assert(pendingInteractionGame(cooking,d,g));await button(first.root,q.labels[q.solution[0]]).fire();
  const records=[serializeProgress(cooking,'dialogue',d),serializeProgress(cooking,'game',g)].map(p=>({...p,compatible:true}));
  const store=new MemoryStore();store.state=async()=>({events:[],seconds:0,progress:records});
  const restored=await fixture(cooking,store);assert.equal(restored.played.length,0);assert(restored.root.querySelector('.sequence-slots'));
  assert.deepEqual(restored.app.stateFor('game').sequence,[q.solution[0]]);
  for(const word of q.solution.slice(1))await button(restored.root,q.labels[word]).fire();
  await button(restored.root,'故事排好了').fire();await button(restored.root,'继续').fire();
  assert.equal(restored.app.stateFor('dialogue').index,5);assert(restored.app.stateFor('game').finished);
  assert.equal(store.events.size,1,'restoring must not resubmit the five earlier replies');
  assert.equal(restored.played.at(-1),restored.app.asset(cooking.modules.dialogue[5].question[0].audio).path);
});

test('two fast game-continue clicks cannot skip the next task or dialogue',async()=>{
  const pack=require('./static/content/dressing.json'),{app,root,store}=await fixture(pack);await answer(root);
  const game=app.stateFor('game'),q=pack.modules.game.questions[0];await button(root,'听听要找什么').fire();
  await root.querySelectorAll('button').find(b=>b.attributes['aria-label']==='选择'+app.word(q.target).cn).fire();
  const next=button(root,'继续');await Promise.all([next.fire(),next.fire()]);
  assert.equal(game.index,1);assert.equal(app.stateFor('dialogue').index,1);assert.equal(store.events.size,2);
});

test('a failed direct answer stays pending, makes no sound, and retries exactly once',async()=>{
  const {app,root,store,played}=await fixture(),save=store.save.bind(store);let fail=true;
  store.save=op=>{if(fail){fail=false;return Promise.reject(Error('offline'));}return save(op);};
  const option=cooking.modules.dialogue[0].options[0];await answer(root);
  assert(app.failure);assert.equal(store.events.size,0);assert.equal(played.length,0);assert.equal(app.pending.operation.payload.selectedId,option.id);
  await app.retry();assert.equal(store.events.size,1);assert.equal(app.failure,null);
  await button(root,'继续对话').fire();assert.equal(store.events.size,1);assert.equal(app.stateFor('dialogue').index,1);
});
