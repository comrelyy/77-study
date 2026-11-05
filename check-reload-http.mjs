import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {BrowserActivity} from './static/core/browser-activity.mjs';
import {PersistentStore} from './static/core/persistent-store.mjs';
import {MemoryStorage} from './static/core/store.mjs';
import {App} from './static/core/app.mjs';
import {Element,documentModel} from './tests/fake-dom.mjs';
import {LockHarness} from './tests/browser-activity-harness.mjs';
const require=createRequire(import.meta.url),pack=require('./static/content/cooking.json'),{Session}=require('./static/core/model.js');
const rootPath=path.dirname(fileURLToPath(import.meta.url));

test('real HTTP reload recovers a lost receipt immediately, preserves quota/progress, and excludes a live second page',{timeout:45000},async()=>{
  const reports=path.resolve(rootPath,'reports'),temp=await fs.mkdtemp(path.join(reports,'reload-http-'));
  const server=spawn(process.env.MOMO_PYTHON||'python',['-u',path.join(rootPath,'app.py'),'--db',path.join(temp,'isolated.sqlite3'),'--port','0'],{cwd:rootPath,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let diagnostics='';server.stderr.on('data',data=>diagnostics+=data);
  try{
    const address=await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error('startup timeout: '+diagnostics)),10000);
      server.once('error',e=>{clearTimeout(timer);reject(e);});server.once('exit',code=>{clearTimeout(timer);reject(Error('server exited '+code));});
      server.stdout.on('data',data=>{out+=data;const match=out.match(/Momo Planet: (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
    });
    const storage=new MemoryStorage(),locks=new LockHarness();let n=0,lose=true,enters=0;
    const fetcher=async(url,options)=>{if(url.endsWith('/enter'))enters++;const r=await fetch(address+url,options);if(lose&&url.endsWith('/operation')){lose=false;await r.json();throw Error('receipt lost after real commit');}return r;};
    const make=()=>new PersistentStore({storage,fetcher,activity:new BrowserActivity({storage,locks}),uuid:()=> 'reload-'+(++n)});
    const original=make();await original.begin();const oldToken=original.token;
    await new Promise(resolve=>setTimeout(resolve,80));await original.tick(.05);
    const round=pack.modules.dialogue[0],choice=round.options[0];
    const payload={theme:'cooking',sceneId:'cooking',contentVersion:pack.contentVersion,moduleId:'dialogue',mode:'dialogue_reply',stepId:round.id,selectedId:choice.id,text:choice.text,source:'child'};
    const progress={sceneId:'cooking',moduleId:'dialogue',contentVersion:pack.contentVersion,state:{practiceId:'reload-practice',stepId:round.id,selectedId:choice.id,confirmed:true,speechIndex:0,history:[payload]}};
    await assert.rejects(original.save({id:'confirmed-before-refresh',kind:'choice',payload,progress}));assert.equal(original.entries().length,1);
    locks.terminateDocument();const refreshed=make();globalThis.document=documentModel();let played=0;
    const app=new App({root:new Element('main'),pack,store:refreshed,Session,uuid:()=> 'app-'+(++n),player:{stop(){},async play(){played++;return true;}}});
    const start=Date.now();await app.init();assert(Date.now()-start<5000,'refresh recovery should not wait for the old ten-second lease');
    assert.equal(app.failure,null);assert.equal(app.view,'home');assert.equal(played,0);assert.equal(refreshed.token,null);assert.equal(refreshed.entries().length,0);
    assert.equal(app.stateFor('dialogue').done,true);assert.equal(app.stateFor('dialogue').selection,choice.id);
    const state=await refreshed.state();assert.equal(state.events.filter(e=>e.kind==='choice').length,1);assert.equal(state.quota.segmentUsed,.05);
    await app.open('dialogue');assert.equal(app.failure,null);const current=refreshed.token;assert.notEqual(current,oldToken);
    await assert.rejects(original.heartbeat(),e=>e.code==='lease_lost');await original.release(oldToken);await refreshed.heartbeat();
    const activeCount=enters;await assert.rejects(make().begin(),e=>e.code==='other_page_active');assert.equal(enters,activeCount,'live other tab is rejected before attempting handover');
    await app.home();
    const next=make();await next.begin();await next.release();
  }finally{
    if(server.exitCode===null){const stopped=once(server,'exit');server.kill();await stopped;}
    const resolved=path.resolve(temp);assert(resolved.startsWith(reports+path.sep+'reload-http-'));await fs.rm(resolved,{recursive:true,force:true});
  }
});
