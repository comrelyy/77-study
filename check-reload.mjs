import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserActivity} from './static/core/browser-activity.mjs';
import {PersistentStore} from './static/core/persistent-store.mjs';
import {MemoryStorage} from './static/core/store.mjs';
import {App} from './static/core/app.mjs';
import {Element,documentModel} from './tests/fake-dom.mjs';
import {LockHarness} from './tests/browser-activity-harness.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),pack=require('./static/content/cooking.json'),{Session}=require('./static/core/model.js');
const settle=async condition=>{for(let i=0;i<300;i++){if(condition())return;await Promise.resolve();}assert(condition(),'condition did not settle');};
function service(){
  const storage=new MemoryStorage(),locks=new LockHarness(),calls=[],operations=new Map();let now=100000,owner=null,token=null,expires=0,serial=0,used=0,loseRelease=false,heldTick=null;
  const quota=()=>({allowed:true,dailyUsed:used,segmentUsed:used,segmentId:'segment',dailyRemaining:900,segmentRemaining:480});
  const state=()=>({schemaVersion:3,seconds:used,events:[...operations.values()].filter(o=>o.kind!=='checkpoint'),progress:[],quota:quota()});
  const response=(code,data)=>({ok:code<400,json:async()=>data});
  const fetcher=async(url,options)=>{
    const route=url.split('/').at(-1),body=options?.body?JSON.parse(options.body):{};calls.push({route,body,keepalive:options?.keepalive});
    if(route==='state')return response(200,state());
    if(route==='enter'){
      const resume=body.previousOwner===owner&&body.resumeToken===token;
      if(owner&&owner!==body.owner&&expires>now&&!resume)return response(409,{code:'other_page_active',error:'another active page',retryAfterMs:expires-now});
      owner=body.owner;token='token-'+(++serial);expires=now+10000;return response(200,{...state(),token,experienceId:body.experienceId});
    }
    if(route==='release'){
      if(loseRelease)throw Error('unload release lost');
      if(owner===body.owner&&token===body.token){owner=null;token=null;expires=0;}return response(200,{ok:true});
    }
    if(body.owner!==owner||body.token!==token||expires<=now)return response(409,{code:'lease_lost',error:'old lease lost'});
    expires=now+10000;
    if(route==='operation'){operations.set(body.operation.id,body.operation);return response(200,{ok:true,id:body.operation.id});}
    if(route==='tick'){
      if(!operations.has(body.id)){operations.set(body.id,{kind:'tick',payload:{}});used+=(body.endedAt-body.startedAt)/1000;}
      const result=response(200,{ok:true,id:body.id,quota:quota()});
      if(heldTick){const holder=heldTick;heldTick=null;return new Promise(resolve=>{holder.finish=()=>resolve(result);});}
      return result;
    }
    return response(200,state());
  };
  let id=0;const make=(withActivity=true)=>new PersistentStore({storage,fetcher,activity:withActivity?new BrowserActivity({storage,locks}):null,uuid:()=>String(++id),now:()=>now});
  return {storage,locks,calls,make,operations,state,now:()=>now,advance:ms=>now+=ms,loseRelease:()=>loseRelease=true,holdTick:()=>{const holder={};heldTick=holder;return holder;}};
}

test('a destroyed document hands over immediately while a live second page remains excluded',async()=>{
  const api=service(),original=api.make();await original.begin();const originalToken=original.token;
  const other=api.make(),enters=api.calls.filter(c=>c.route==='enter').length;
  await assert.rejects(other.begin(),e=>e.code==='other_page_active');assert.equal(api.calls.filter(c=>c.route==='enter').length,enters);
  api.locks.terminateDocument();const reload=api.make();await reload.begin();assert.notEqual(reload.token,originalToken);
  await assert.rejects(original.heartbeat(),e=>e.code==='lease_lost');
  await original.release(originalToken);await reload.heartbeat();await reload.release();
  await other.begin();await other.release();
});

test('parallel reconnects rotate the server token only once and release both locks before another activity',async()=>{
  const api=service(),store=api.make();await store.begin();const before=api.calls.filter(c=>c.route==='enter').length;
  const results=await Promise.all([store.reconnect(),store.reconnect(),store.reconnect()]);
  assert.equal(api.calls.filter(c=>c.route==='enter').length,before+1);assert(results.every(r=>r.schemaVersion===3));
  await store.heartbeat();await store.release();await store.begin();await store.release();
});

test('pagehide persists the final interval before waiting, releases immediately, and never reacquires on the dying page',async()=>{
  const api=service();globalThis.document=documentModel();const store=api.make(),app=new App({root:new Element('main'),pack,store,Session,now:api.now,uuid:()=> 'app-'+Math.random(),player:{stop(){},async play(){return true;}}});
  await app.init();await app.open('story');const held=api.holdTick();api.advance(1000);const ticking=app.tick();await settle(()=>held.finish);
  api.advance(750);const suspending=app.suspend();
  assert.equal(store.entries().filter(e=>e.type==='tick').length,2,'the last 750ms must already be durable');
  api.loseRelease();app.pageHide();await settle(()=>api.calls.some(c=>c.route==='release'));
  assert(store.retired);assert(api.calls.find(c=>c.route==='release').keepalive);await assert.rejects(store.acquire(),e=>e.code==='page_closing');
  api.locks.terminateDocument();const reload=api.make();const recovered=await reload.state();
  assert.equal(recovered.pendingCount,undefined);assert.equal(store.entries().length,0);assert.equal(api.state().quota.segmentUsed,1.75);
  held.finish();await ticking;await suspending;await reload.heartbeat();
  // Drop the test lock without pretending the intentionally lost request succeeded.
  await reload.activity.drop();
});

test('leaving while a browser-lock request is pending cannot strand the browser lock',async()=>{
  const storage=new MemoryStorage(),locks=new LockHarness(),first=new BrowserActivity({storage,locks});
  const claim=first.claim();const dropped=first.drop();await assert.rejects(claim,e=>e.code==='page_closing');await dropped;
  const replacement=new BrowserActivity({storage,locks});await replacement.claim();assert(replacement.held);await replacement.drop();
});

test('the native Web Locks manager enforces exclusion and awaited release',async()=>{
  assert.equal(typeof navigator.locks.request,'function');const storage=new MemoryStorage();
  const one=new BrowserActivity({storage}),two=new BrowserActivity({storage});
  await one.claim();await assert.rejects(two.claim(),e=>e.code==='other_page_active');
  await one.drop();await two.claim();assert(two.held);await two.drop();
});

test('a legacy orphaned lease recovers automatically after expiry without user retries or autoplay',async()=>{
  const api=service(),old=api.make(false);await old.begin();api.advance(9999);
  globalThis.document=documentModel();const app=new App({root:new Element('main'),pack,store:api.make(false),Session,now:api.now,uuid:()=>String(Math.random()),player:{stop(){},async play(){throw Error('must not autoplay during recovery');}}});
  await app.init();await app.open('summary');assert.equal(app.failure.code,'other_page_active');assert(app.recoveryTimer);
  api.advance(2);await new Promise(resolve=>setTimeout(resolve,350));
  assert.equal(app.failure,null);assert.equal(app.view,'home');assert.equal(app.store.token,null);clearTimeout(app.recoveryTimer);
});

test('returning home from a live-page conflict does not clear the active page or trap the user on the error',async()=>{
  const api=service(),first=api.make();await first.begin();globalThis.document=documentModel();
  const app=new App({root:new Element('main'),pack,store:api.make(),Session,uuid:()=>String(Math.random()),player:{stop(){},async play(){return true;}}});
  await app.init();await app.open('summary');assert.equal(app.failure.code,'other_page_active');
  await app.home();assert.equal(app.view,'home');assert.equal(app.failure,null);await first.heartbeat();await first.release();
});

test('a transient browser-lock conflict recovers automatically only after the live document releases',async()=>{
  const api=service(),first=api.make();await first.begin();globalThis.document=documentModel();
  const app=new App({root:new Element('main'),pack,store:api.make(),Session,uuid:()=>String(Math.random()),player:{stop(){},async play(){throw Error('must not autoplay');}}});
  await app.init();await app.open('summary');assert.equal(app.failure.code,'other_page_active');assert(app.recoveryTimer);
  await first.heartbeat();assert.equal(api.calls.filter(c=>c.route==='enter').length,1,'the second document must not take over an active page');
  await first.release();await new Promise(resolve=>setTimeout(resolve,1250));assert.equal(app.failure,null);assert.equal(app.view,'home');assert.equal(app.store.token,null);clearTimeout(app.recoveryTimer);
});
