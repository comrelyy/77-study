import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {App} from './static/core/app.mjs';
import {PersistentStore} from './static/core/persistent-store.mjs';
import {MemoryStorage} from './static/core/store.mjs';
import {pendingInteractionGame} from './static/core/interaction-flow.mjs';
import {Element,documentModel} from './tests/fake-dom.mjs';
const require=createRequire(import.meta.url),pack=require('./static/content/cooking.json'),{Session}=require('./static/core/model.js');
const rootPath=path.dirname(fileURLToPath(import.meta.url));
const click=(root,label)=>{const b=root.querySelectorAll('button').find(b=>b.textContent===label);assert(b,'missing '+label);return b.fire();};

test('one continuous interaction persists dialogue and game independently through the actual Python service', {timeout:45000},async()=>{
  const reports=path.resolve(rootPath,'reports'),temp=await fs.mkdtemp(path.join(reports,'interaction-http-'));
  const db=path.join(temp,'isolated.sqlite3');
  const server=spawn(process.env.MOMO_PYTHON||'python',['-u',path.join(rootPath,'app.py'),'--db',db,'--port','0'],{cwd:rootPath,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let diagnostics='';server.stderr.on('data',data=>diagnostics+=data);
  try{
    const address=await new Promise((resolve,reject)=>{
      let output='';const timer=setTimeout(()=>reject(Error('isolated HTTP startup timed out: '+diagnostics)),10000);
      server.once('error',error=>{clearTimeout(timer);reject(error);});
      server.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/Momo Planet: (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
      server.once('exit',code=>{clearTimeout(timer);reject(Error('isolated server exited '+code+': '+diagnostics));});
    });
    globalThis.document=documentModel();const root=new Element('main');let n=0;
    const store=new PersistentStore({storage:new MemoryStorage(),uuid:()=> 'http-flow-'+(++n),fetcher:(url,options)=>fetch(address+url,options)});
    const app=new App({root,pack,store,Session,uuid:()=> 'app-flow-'+(++n),player:{stop(){},async play(){return true;}}});
    await app.init();await app.open('dialogue');let guard=0;
    while(app.view==='module'&&guard++<30){
      const dialogue=app.stateFor('dialogue'),game=app.stateFor('game');
      if(pendingInteractionGame(pack,dialogue,game)){
        const q=pack.modules.game.questions[game.index];for(const word of q.solution)await click(root,q.labels[word]);
        await click(root,'故事排好了');await click(root,'继续');
      }else await root.querySelector('.reply-card').fire();
      assert.equal(app.failure,null,JSON.stringify(app.failure));
    }
    assert.equal(app.view,'complete');if(app.leaving)await app.leaving;
    const state=await store.state(),choices=state.events.filter(e=>e.kind==='choice');
    assert.equal(choices.filter(e=>e.payload.moduleId==='dialogue').length,6);
    assert.equal(choices.filter(e=>e.payload.moduleId==='game').length,1);
    const progress=state.progress.find(p=>p.sceneId==='cooking'&&p.moduleId==='game');
    assert.equal(progress.state.finished,true);assert.deepEqual(progress.state.sequenceOrder,pack.modules.game.questions[0].solution);
    assert.equal(store.entries().length,0);assert(state.progress.some(p=>p.moduleId==='dialogue'));
  }finally{
    if(server.exitCode===null){const stopped=once(server,'exit');server.kill();await stopped;}
    // Remove only the unique test directory under this project's reports folder.
    const resolved=path.resolve(temp);assert(resolved.startsWith(reports+path.sep+'interaction-http-'));
    await fs.rm(resolved,{recursive:true,force:true});
  }
});
