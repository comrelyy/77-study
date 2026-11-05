import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {App} from './static/core/app.mjs';
import {MemoryStore} from './static/core/store.mjs';
import {Element,documentModel} from './tests/fake-dom.mjs';
const require=createRequire(import.meta.url),{Session}=require('./static/core/model.js'),{Player}=require('./static/core/player.js');
const pack=require('./static/content/cooking.json');
const find=(root,label)=>{const b=root.querySelectorAll('button').find(b=>b.textContent===label);assert(b,'missing '+label);return b;};
async function fixture({automatic=true,fail=false,storyPack=pack}={}){
  globalThis.document=documentModel();const root=new Element('main'),store=new MemoryStore(),sounds=[];let n=0;
  const player=new Player({audio:url=>{const sound={url,paused:false,pause(){this.paused=true;},play(){if(fail)return Promise.reject(Error('unavailable'));if(automatic)queueMicrotask(()=>sound.onended());return Promise.resolve();}};sounds.push(sound);return sound;}});
  const app=new App({root,pack:storyPack,store,player,Session,uuid:()=>String(++n)});await app.init();app.open('story');return {root,app,store,sounds,state:app.stateFor('story')};
}
async function until(condition){for(let i=0;i<100;i++){if(condition())return;await Promise.resolve();}assert(condition(),'playback did not reach the expected state');}
const scenePaths=pack.modules.story[0].segments.map(s=>pack.assets.find(a=>a.id===s.audio).path);

test('all twelve themes listen and replay narration and both characters through the real controls',async()=>{
  const catalog=require('./static/content/catalog.json');
  for(const file of Object.values(catalog.scenes)){
    const storyPack=require('./static/'+file),paths=storyPack.modules.story[0].segments.map(s=>storyPack.assets.find(a=>a.id===s.audio).path);
    const {root,store,sounds,state}=await fixture({storyPack});assert.equal(sounds.length,0,'entering a module must not autoplay');
    await find(root,'听英语故事').fire();assert.deepEqual(sounds.map(s=>s.url),paths);assert(state.saved);assert.equal(store.events.size,1);
    await find(root,'重听这一幕').fire();assert.deepEqual(sounds.map(s=>s.url),[...paths,...paths]);assert.equal(store.events.size,2);
  }
});

test('replay while playing cancels the old run and starts this scene immediately',async()=>{
  const {root,store,sounds,state,app}=await fixture({automatic:false});
  const initial=find(root,'听英语故事').fire();assert.equal(sounds.length,1);
  const replay=find(root,'重听这一幕').fire();assert.equal(sounds.length,2);assert(sounds[0].paused);
  const generation=app.generation;await initial;assert.equal(app.generation,generation,'cancelled handler must not redraw and silence the replacement');assert(state.running);
  sounds[0].onended();assert.equal(state.fragment,0);
  for(let i=0;i<scenePaths.length;i++){await until(()=>sounds.length>=i+2);sounds[i+1].onended();}
  await replay;assert(state.saved);assert.equal(store.events.size,1);assert.deepEqual(sounds.slice(1).map(s=>s.url),scenePaths);
});

test('pause and resume replay the interrupted line and do not record an incomplete scene',async()=>{
  const {root,store,sounds,state}=await fixture({automatic:false});
  const first=find(root,'听英语故事').fire();sounds[0].onended();await until(()=>sounds.length===2);
  await find(root,'暂停声音').fire();await first;assert.equal(state.fragment,1);assert.equal(store.events.size,0);
  sounds[1].onended();assert.equal(state.fragment,1);
  const resume=find(root,'继续这一幕').fire();await until(()=>sounds.length===3);assert.equal(sounds[2].url,scenePaths[1]);
  sounds[2].onended();await until(()=>sounds.length===4);sounds[3].onended();await resume;assert(state.saved);assert.equal(store.events.size,1);
});

test('an unavailable audio file keeps the scene incomplete and shows a usable retry message',async()=>{
  const {root,store,state}=await fixture({fail:true});await find(root,'听英语故事').fire();assert.equal(state.fragment,0);assert.equal(store.events.size,0);assert(root.querySelector('#message').textContent.includes('声音'));assert.equal(find(root,'听英语故事').disabled,false);
});
