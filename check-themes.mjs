import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {availableScenes,chooseScene} from './static/core/catalog.mjs';
import {App} from './static/core/app.mjs';
import {renderDayMap,mapLevels} from './static/core/day-map.mjs';
import {routeOrder,levelStates} from './static/core/route.mjs';
import {MemoryStore} from './static/core/store.mjs';
import {loadReviewSources} from './static/core/review-sources.mjs';
import {Element,documentModel} from './tests/fake-dom.mjs';
const require=createRequire(import.meta.url),catalog=require('./static/content/catalog.json'),picnic=require('./static/content/picnic.json'),tidy=require('./static/content/tidy.json'),{Session,validate}=require('./static/core/model.js');
const packs=Object.values(catalog.scenes).map(file=>require('./static/'+file));
const scenes=[picnic,tidy].map(p=>({id:p.sceneId,title:p.title,image:p.assets.find(a=>a.id===p.words[0].image).path}));
async function fixture(pack=picnic){globalThis.document=documentModel();const root=new Element('main'),calls=[];let id=0;const app=new App({root,pack,scenes,navigateScene:async id=>calls.push(id),store:new MemoryStore(),player:{stop(){},async play(){return true;}},Session,uuid:()=>String(++id)});await app.init();return {app,root,calls};}
test('normal previews, internal examples, and releases have separate entry rules',()=>{
  assert.deepEqual(new Set(availableScenes(catalog)),new Set(['dressing','washing','breakfast','cooking','tidy','picnic','park','transport','shopping','weather','gardening','bedtime','birthday']));
  assert.deepEqual(chooseScene(catalog,null,'tidy'),{id:'tidy',internal:false});
  assert.deepEqual(chooseScene(catalog,'tidy'),{id:'tidy',internal:true});
  assert.throws(()=>chooseScene(catalog,null,'unknown'));
  const release={...catalog,mode:'release',releasedScenes:['picnic']};
  assert.deepEqual(availableScenes(release),['picnic']);
  assert.throws(()=>chooseScene(release,null,'tidy'));assert.throws(()=>chooseScene(release,'tidy'));
});
test('all selectable themes have real local images and valid non-silent audio',()=>{
  for(const pack of packs){assert.deepEqual(validate(pack,{exists:path=>fs.existsSync('static/'+path)}).errors,[]);const pending=a=>pack.lesson?.reviewed===false&&a.id.includes('.lesson.');// lesson audio awaits synthesis
    assert(pack.assets.every(a=>pending(a)||fs.existsSync('static/'+a.path)));const audio=require('./audio-validation.cjs').inspectPack(pack,'static').filter(a=>!pending(a));assert(audio.length>0&&audio.every(a=>a.valid));}
  assert.deepEqual(new Set(tidy.modules.story.map(s=>s.mainWord)),new Set(tidy.words.map(w=>w.id)));
});
test('the day map is a separate page with no activity modules',async()=>{
  globalThis.document=documentModel();const root=new Element('main'),calls=[],order=routeOrder(catalog);
  const levels=mapLevels(order,catalog,Object.fromEntries(order.map(id=>[id,require('./static/'+catalog.scenes[id])])));
  renderDayMap(root,{levels,states:levelStates(order,new Set()),enterScene:id=>calls.push(id),playAudio:()=>{}});
  assert.equal(root.querySelectorAll('.map-level').length,order.length);
  assert(!root.querySelector('.hero'));assert(!root.querySelector('.activity'));
  await root.querySelector('.map-go').fire();assert.deepEqual(calls,['washing']);
});
test('theme home has a return to selection and keeps exit controls below parent notes',async()=>{
  const {app,root,calls}=await fixture();app.data.notices=['说明'];app.draw();
  assert.equal(root.querySelectorAll('.map-level').length,0);assert(root.querySelector('.hero'));assert.equal(root.querySelectorAll('.activity').length,1);assert(root.textContent.includes('开始这节课'));assert(!root.querySelectorAll('.activity').some(b=>/情景互动|游戏互动|主题小故事|单词汇总/.test(b.textContent)));
  const notes=[...root.children].findIndex(e=>e.tagName==='details');assert(root.children[notes+1].className.includes('home-actions'));
  await root.querySelector('.theme-back').fire();assert.deepEqual(calls,[null]);
});
test('theme switching waits for checkpoint, flush, and release; repeated clicks do not navigate twice',async()=>{
  const {app,calls}=await fixture();app.open('story');app.stateFor('story').next();const order=[];let finish;
  app.store.persistent=true;app.store.token='lease';app.last=app.now();
  app.store.checkpoint=async p=>{order.push('checkpoint:'+p.sceneId+':'+p.state.stepId);return {};};
  app.store.flush=()=>new Promise(resolve=>{finish=()=>{order.push('flush');resolve();};});
  app.store.release=async()=>order.push('release');app.navigateScene=async id=>{order.push('navigate');calls.push(id);};
  const switching=app.selectScene(null);while(!finish)await Promise.resolve();
  await app.selectScene(null);assert.deepEqual(calls,[]);finish();await switching;
  assert.deepEqual(order,['checkpoint:picnic:picnic.story.2','flush','release','navigate']);assert.deepEqual(calls,[null]);
});
test('a failed save blocks theme navigation and preserves the current pack',async()=>{
  const {app,calls}=await fixture();app.store.persistent=true;app.store.flush=async()=>{throw Error('offline');};app.store.release=async()=>{};
  await app.selectScene('tidy');assert.deepEqual(calls,[]);assert(app.failure);assert.equal(app.pack.sceneId,'picnic');
});
test('tidy uses toy artwork and its own sticker copy in all four modules',async()=>{
  const {app,root}=await fixture(tidy);assert(root.querySelector('.tidy-home-scene'));
  for(const module of ['story','dialogue','game','summary']){app.open(module);assert(root.querySelector('.toolbar'));}
  app.store.events.set('tidy-sticker',{kind:'sticker',payload:{theme:'tidy'}});await app.stickers();assert(root.textContent.includes(tidy.title));assert(!root.textContent.includes('这次野餐'));assert(root.querySelectorAll('img').some(i=>i.src==='illustrations/ball.svg'));
});
test('review loads both explicit development previews and keeps internal samples isolated',async()=>{
  const events=[{kind:'introduced',payload:{sceneId:'tidy',wordId:tidy.words[0].id,contentVersion:tidy.contentVersion}}];
  const options={catalog,current:picnic,events,validate,fetcher:async path=>({ok:true,json:async()=>tidy})};
  const normal=await loadReviewSources(options);assert(normal.packs.some(p=>p.sceneId==='tidy'));
  const internal=await loadReviewSources({...options,internal:true});assert.deepEqual(internal.packs,[picnic]);
});
