import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {PersistentStore} from './static/core/persistent-store.mjs';
import {MemoryStorage} from './static/core/store.mjs';
import {StoryState} from './static/core/story-state.mjs';
import {serializeProgress,restoreProgress} from './static/core/progress.mjs';
import {App} from './static/core/app.mjs';
import {Element,documentModel} from './tests/fake-dom.mjs';
const require=createRequire(import.meta.url),{Session}=require('./static/core/model.js'),pack=require('./static/content/picnic.json');
let unique=0;
function fakeService(){
  const events=new Map(),progress=new Map(),operations=new Map(),ticks=new Map(),calls=[];
  let now=100000,owner=null,token=null,expires=0,serial=0,used=0,lose=false,unavailable=false;
  const quota=()=>({dailyUsed:used,segmentUsed:used,dailyLimit:900,segmentLimit:480,dailyRemaining:900-used,segmentRemaining:480-used,remaining:480-used,allowed:used<480,segmentId:'segment-a',dateAnomaly:false});
  const state=()=>({schemaVersion:3,seconds:used,events:[...events.values()],progress:[...progress.values()],quota:quota()});
  const response=(status,data)=>({ok:status<400,status,json:async()=>structuredClone(data)});
  const fetcher=async(url,options)=>{
    if(unavailable)throw Error('offline');const path=url.split('/api/v3/')[1],body=options?.body?JSON.parse(options.body):{};calls.push({path,body});
    if(path==='state')return response(200,state());
    if(path==='enter'){
      if(owner&&owner!==body.owner&&expires>now)return response(409,{code:'other_page_active',error:'other page active',state:state()});
      if(used>=480&&!body.recoverOnly)return response(409,{code:'quota_exhausted',error:'quota exhausted',state:state()});
      owner=body.owner;token='token-'+(++serial);expires=now+10000;return response(200,{...state(),token,experienceId:body.experienceId});
    }
    if(path==='release'){if(owner===body.owner&&token===body.token){owner=null;token=null;expires=0;}return response(200,{ok:true});}
    if(body.owner!==owner||body.token!==token||expires<=now)return response(409,{code:'lease_lost',error:'lease lost',state:state()});
    expires=now+10000;
    let result;
    if(path==='operation'){
      const op=body.operation,digest=JSON.stringify(op),old=operations.get(op.id);
      if(old){if(old.digest!==digest)return response(409,{code:'id_conflict',error:'ID conflict'});return response(200,{...old.result,quota:quota()});}
      let revision=null,progressConflict=false;
      if(op.progress){const p=op.progress,key=p.sceneId+'/'+p.moduleId,previous=progress.get(key),current=previous?.revision||0;if(p.expectedRevision!==current){if(op.kind==='checkpoint')return response(409,{code:'progress_conflict',error:'newer progress exists'});progressConflict=true;}else{revision=current+1;progress.set(key,{...p,compatible:true,revision});}}
      if(op.kind!=='checkpoint')events.set(op.id,op);
      result={ok:true,id:op.id,revision,progressConflict,quota:quota()};operations.set(op.id,{digest,result});
    }else if(path==='tick'){
      const digest=JSON.stringify({startedAt:body.startedAt,endedAt:body.endedAt,originToken:body.originToken,segmentId:body.segmentId}),old=ticks.get(body.id);
      if(old){if(old.digest!==digest)return response(409,{code:'id_conflict',error:'ID conflict'});return response(200,{...old.result,quota:quota()});}
      const deducted=(body.endedAt-body.startedAt)/1000;used+=deducted;result={ok:true,id:body.id,deducted,quota:quota()};ticks.set(body.id,{digest,result});
    }else result=state();
    if(lose){lose=false;throw Error('response lost after commit');}
    return response(200,result);
  };
  const storage=new MemoryStorage(),make=()=>new PersistentStore({fetcher,storage,uuid:()=>String(++unique),now:()=>now});
  return {make,fetcher,storage,events,progress,operations,ticks,calls,now:()=>now,advance:ms=>now+=ms,loseNext:()=>lose=true,setOffline:v=>unavailable=v,state};
}
const operation=(id='choice-a')=>({id,kind:'choice',payload:{sceneId:'picnic',moduleId:'dialogue',contentVersion:'0.1.0',text:'Yes, please!'}});
test('default transport preserves the browser global receiver for reads and writes',async()=>{
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async function(url,options){
    if(this!==globalThis)throw new TypeError('Illegal invocation');
    calls.push({url,options});return {ok:true,json:async()=>({schemaVersion:3,events:[],progress:[]})};
  };
  try{
    const store=new PersistentStore({storage:new MemoryStorage(),uuid:()=>String(++unique)});
    await store.state();await store.request('heartbeat',{});
    assert.deepEqual(calls.map(x=>x.url),['/api/v3/state','/api/v3/heartbeat']);
    assert.equal(calls[0].options.cache,'no-store');assert.equal(calls[1].options.method,'POST');
  }finally{globalThis.fetch=original;}
});
function story(){const s=new StoryState(pack.modules.story);s.practiceId='practice-a';return s;}
test('outbox persists before network and a lost response reuses the exact semantic operation',async()=>{
  const api=fakeService(),store=api.make();await store.begin();api.loseNext();await assert.rejects(store.save(operation()));assert.equal(api.events.size,1);assert.equal(store.entries().length,1);
  const original=structuredClone(store.entries()[0].body.operation);await store.reconnect();await store.save(operation());assert.equal(api.events.size,1);assert.equal(store.entries().length,0);
  const sent=api.calls.filter(x=>x.path==='operation').map(x=>x.body.operation);assert.deepEqual(sent,[original,original]);
});
test('reload recovers another document outbox without automatically playing or duplicating facts',async()=>{
  const api=fakeService(),first=api.make();await first.begin();api.loseNext();await assert.rejects(first.save(operation()));api.advance(11000);
  const replacement=api.make(),state=await replacement.state();assert.equal(replacement.entries().length,0);assert.equal(api.events.size,1);assert(state.recoveryMessage);assert.equal(state.pendingCount,undefined);
});
test('pending tick keeps original ID and interval after lost response',async()=>{
  const api=fakeService(),store=api.make();await store.begin();api.advance(1000);api.loseNext();await assert.rejects(store.tick(1));const pending=structuredClone(store.entries()[0]);api.advance(1000);await store.tick(1);assert.equal(api.ticks.size,1);assert.equal(api.state().quota.segmentUsed,1);const sent=api.calls.filter(x=>x.path==='tick');assert.equal(sent[0].body.id,pending.id);assert.equal(sent[1].body.startedAt,pending.body.startedAt);
});
test('failed durable storage forbids sending a business request',async()=>{
  const api=fakeService(),store=api.make();await store.begin();api.storage.setItem=()=>{throw Error('quota exceeded');};await assert.rejects(store.save(operation()),e=>e.code==='local_storage_failed');assert.equal(api.events.size,0);assert.equal(api.calls.filter(x=>x.path==='operation').length,0);
});
test('uncertain operation blocks new operations until reconciliation',async()=>{
  const api=fakeService(),store=api.make();await store.begin();api.loseNext();await assert.rejects(store.save(operation()));await assert.rejects(store.save(operation('new-choice')),e=>e.code==='pending_operations');assert.equal(store.entries().length,1);await store.reconnect();await store.save(operation('new-choice'));assert.equal(api.events.size,2);
});
test('changed data with an acknowledged ID cannot be sent again',async()=>{
  const api=fakeService(),store=api.make();await store.begin();await store.save(operation());const changed=operation();changed.payload.text='different';await assert.rejects(store.save(changed),e=>e.code==='id_conflict');assert.equal(api.events.size,1);
});
test('second active page is rejected; explicit reconnect after expiry takes over',async()=>{
  const api=fakeService(),one=api.make(),two=api.make();await one.begin();await assert.rejects(two.begin(),e=>e.code==='other_page_active');api.advance(11000);await two.reconnect();await assert.rejects(one.heartbeat(),e=>e.code==='lease_lost');
});
test('checkpoint revisions advance in queue order without participation records',async()=>{
  const api=fakeService(),store=api.make();await store.begin();const s=story();const first=store.checkpoint(serializeProgress(pack,'story',s));s.fragment=1;s.heard.add(s.scene.segments[0].id);const second=store.checkpoint(serializeProgress(pack,'story',s));await Promise.all([first,second]);assert.equal(api.events.size,0);assert.equal(api.progress.get('picnic/story').revision,2);assert.equal(api.progress.get('picnic/story').state.fragmentId,s.scene.segments[1].id);
});
test('stale non-business checkpoint does not overwrite newer server progress',async()=>{
  const api=fakeService(),store=api.make();await store.begin();api.progress.set('picnic/story',{...serializeProgress(pack,'story',story()),revision:5,compatible:true});const result=await store.checkpoint(serializeProgress(pack,'story',story()));assert(result.discardedCheckpoint);assert.equal(api.progress.get('picnic/story').revision,5);assert.equal(api.events.size,0);assert(store.blocked);await store.reconnect();assert.equal(store.blocked,false);
});
test('already confirmed fact survives progress conflict without rewinding server state',async()=>{
  const api=fakeService(),store=api.make();await store.begin();api.progress.set('picnic/story',{...serializeProgress(pack,'story',story()),revision:5,compatible:true});const op=operation();op.progress=serializeProgress(pack,'story',story());const result=await store.save(op);assert(result.progressConflict);assert.equal(api.events.size,1);assert.equal(api.progress.get('picnic/story').revision,5);
});
test('story position restores an interrupted fragment rather than skipping it',()=>{
  const s=story();s.fragment=1;s.heard.add(s.scene.segments[0].id);const record={...serializeProgress(pack,'story',s),compatible:true};const restored=story();assert(restoreProgress(pack,'story',restored,record));assert.equal(restored.fragment,1);assert.equal(restored.saved,false);assert.equal(restored.heard.size,1);
});
test('confirmed dialogue restores pending speech without replaying submission',()=>{
  const s=new Session(pack);s.practiceId='practice-d';s.selection=pack.modules.dialogue[0].options[0].id;s.done=true;s.speechIndex=1;s.events=[{text:'Yes, please!'}];const record={...serializeProgress(pack,'dialogue',s),compatible:true};const restored=new Session(pack);assert(restoreProgress(pack,'dialogue',restored,record));assert(restored.done);assert.equal(restored.speechIndex,1);assert.equal(restored.pending,null);
});
test('game resumes candidate order, attempt count and demonstration; requires listening again',()=>{
  const s=new Session(pack,{random:()=>0});s.enter('game');s.practiceId='practice-g';s.help('demo');s.attempts=2;s.heard=true;const order=s.candidates(),record={...serializeProgress(pack,'game',s),compatible:true};const restored=new Session(pack);restored.enter('game');assert(restoreProgress(pack,'game',restored,record));assert.deepEqual(restored.candidates(),order);assert.equal(restored.attempts,2);assert(restored.demoUsed);assert.equal(restored.heard,false);
});
test('incompatible version resets only positions; malformed stable references cannot restore',()=>{
  const s=story(),record={...serializeProgress(pack,'story',s),compatible:false};assert.equal(restoreProgress(pack,'story',story(),record),false);record.compatible=true;record.state.fragmentId='missing';assert.equal(restoreProgress(pack,'story',story(),record),false);
});
async function application(api,player={stop(){},source:'local-file',async play(){return true;}}){globalThis.document=documentModel();const store=api.make(),app=new App({root:new Element('main'),pack,store,player,Session,uuid:()=>String(++unique),now:api.now});await app.init();return app;}
test('actual controller restores confirmed dialogue at the interrupted audio, without resubmitting',async()=>{
  const api=fakeService(),played=[];const app=await application(api,{stop(){},source:'local-file',async play(path){played.push(path);return !path.endsWith('.follow.audio.wav');}});await app.open('dialogue');const s=app.stateFor('dialogue');s.select(pack.modules.dialogue[0].options[0].id);await s.confirm();await app.dialogueSpeech(s);assert.equal(s.speechIndex,1);assert.equal(api.events.size,1);await app.leavePersistent('suspended');
  const resumed=[];const replacement=await application(api,{stop(){},source:'local-file',async play(path){resumed.push(path);return true;}});assert.equal(resumed.length,0);await replacement.open('dialogue');const restored=replacement.stateFor('dialogue');assert(restored.done);assert.equal(restored.speechIndex,1);await replacement.dialogueSpeech(restored);assert.equal(resumed.length,2);assert(resumed[0].endsWith('.follow.audio.wav'));assert.equal(resumed[1],replacement.asset(pack.modules.dialogue[1].question[0].audio).path);assert.equal(restored.index,1);assert(!restored.done);assert.equal(api.events.size,1);
});
test('actual controller uses server quota rather than old sessionStorage credit',async()=>{
  const api=fakeService(),app=await application(api);await app.open('summary');api.advance(1000);await app.tick();assert.equal(app.session,1);await app.home();const replacement=await application(api);assert.equal(replacement.session,1);await replacement.open('story',true);assert.equal(replacement.session,1);
});
test('immediate home then re-entry waits for settlement and retains an active lease',async()=>{
  const api=fakeService(),app=await application(api);await app.open('story');api.advance(1000);const leaving=app.home();const entering=app.open('summary');await Promise.all([leaving,entering]);assert.equal(app.view,'module');assert.equal(app.moduleId,'summary');await app.store.heartbeat();assert.equal(app.session,1);
});
test('hidden activity stops and checkpoints without automatically restarting audio',async()=>{
  const api=fakeService(),app=await application(api);await app.open('story');const s=app.stateFor('story');s.fragment=1;s.heard.add(s.scene.segments[0].id);api.advance(1000);await app.suspend();assert.equal(app.view,'suspended');assert.equal(api.progress.get('picnic/story').state.fragmentId,s.scene.segments[1].id);assert.equal(api.events.size,0);assert.equal(api.state().quota.segmentUsed,1);
});
test('waiting for an acknowledged tick does not silently discard subsequent foreground time',async()=>{
  const api=fakeService(),app=await application(api);await app.open('summary');const fetcher=app.store.fetcher;let release,held=true;
  app.store.fetcher=async(url,options)=>{const response=await fetcher(url,options);if(held&&url.endsWith('/tick')){held=false;await new Promise(r=>release=r);}return response;};
  api.advance(1000);const pending=app.tick();while(!release)await Promise.resolve();api.advance(1000);await app.tick();api.advance(1000);release();await pending;await app.tick();assert.equal(app.session,3);assert.equal(api.state().quota.segmentUsed,3);
});
test('late quota responses cannot refill credit or replace a newer server instance',()=>{const store=fakeService().make();store.acceptQuota({authorityInstance:'server-a',authoritySequence:2,segmentUsed:10});store.acceptQuota({authorityInstance:'server-a',authoritySequence:1,segmentUsed:0});assert.equal(store.quota.segmentUsed,10);store.acceptQuota({authorityInstance:'server-b',authoritySequence:1,segmentUsed:11});store.acceptQuota({authorityInstance:'server-a',authoritySequence:3,segmentUsed:0});assert.equal(store.quota.segmentUsed,11);});
test('all activity entries open normally with available time and explain exhausted time',async()=>{
  for(const module of ['story','dialogue','game','summary']){
    const api=fakeService(),app=await application(api);await app.open(module);assert.equal(app.view,'module');assert.equal(app.moduleId,module);await app.home();
    const exhausted=await application(fakeService());exhausted.store.begin=async()=>{const error=new Error('quota exhausted');error.code='quota_exhausted';error.state={quota:{allowed:false,dailyRemaining:0,segmentRemaining:0,dailyUsed:900,segmentUsed:480},events:[]};throw error;};await exhausted.open(module);assert.equal(exhausted.view,'rest');assert(exhausted.root.textContent.includes('\u4eca\u5929\u7684\u4f53\u9a8c\u65f6\u95f4\u7528\u5b8c\u5566'));assert(!exhausted.root.textContent.includes('\u8c22\u8c22\u4f60\uff0c\u4e00\u8d77\u73a9'));
  }
});
test('startup recovers an archived-version receipt then clears the temporary reload block',async()=>{const api=fakeService();let unavailable=true;const fetcher=async(url,options)=>{if(url.endsWith('/operation')&&unavailable)throw Error('offline');const response=await api.fetcher(url,options),data=await response.json();if(url.endsWith('/operation'))data.contentUpdated=true;return {...response,json:async()=>data};};const first=new PersistentStore({fetcher,storage:api.storage,uuid:()=>String(++unique),now:api.now});await first.begin();await assert.rejects(first.save(operation('archived-pending')));assert.equal(first.entries().length,1);api.advance(11000);unavailable=false;const next=new PersistentStore({fetcher,storage:api.storage,uuid:()=>String(++unique),now:api.now});await next.state();assert.equal(next.entries().length,0);assert.equal(api.events.size,1);assert(!next.blocked);assert(!next.needsProgressReload);await next.begin();});

test('conflict retry protects active page and releases recovery lease on home',async()=>{
  const api=fakeService(),first=await application(api),second=await application(api);
  await first.open('summary');await second.open('story');
  assert.equal(second.failure.code,'other_page_active');
  assert(second.root.textContent.includes('重新连接'));
  assert(!second.root.textContent.includes('重试保存'));
  await second.retry();assert.equal(second.failure.code,'other_page_active');
  await first.store.heartbeat();
  await first.home();await second.retry();
  assert.equal(second.failure,null);assert.equal(second.view,'home');assert.equal(second.store.token,null);
  // A recovery-only page on home must not lock out the other tab.
  await first.open('summary');assert.equal(first.failure,null);assert.equal(first.view,'module');
});

test('refresh with an unreleased old lease can reconnect after expiry without clearing data',async()=>{
  const api=fakeService(),old=await application(api);await old.open('summary');
  const refreshed=await application(api);await refreshed.open('summary');
  assert.equal(refreshed.failure.code,'other_page_active');
  api.advance(11000);await refreshed.retry();
  assert.equal(refreshed.failure,null);assert.equal(refreshed.store.token,null);
  await refreshed.open('summary');assert.equal(refreshed.view,'module');
  await assert.rejects(old.store.heartbeat(),e=>e.code==='lease_lost');
});
