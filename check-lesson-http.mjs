import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {App} from './static/core/app.mjs';
import {PersistentStore} from './static/core/persistent-store.mjs';
import {MemoryStorage} from './static/core/store.mjs';
import {Element,documentModel} from './tests/fake-dom.mjs';
const require=createRequire(import.meta.url),pack=require('./static/content/park.json'),{Session}=require('./static/core/model.js');
const rootPath=path.dirname(fileURLToPath(import.meta.url));
const click=(root,label)=>{const b=root.querySelectorAll('button').find(b=>b.textContent===label);assert(b,'missing '+label);return b.fire();};
const pick=(root,id)=>{const b=root.querySelectorAll('button').find(b=>b.attributes['data-id']===id);assert(b,'missing option '+id);return b.fire();};

test('a park lesson with one wrong answer persists answers and progress through the actual Python service',{timeout:60000},async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lesson-http-')),db=path.join(temp,'isolated.sqlite3');
  const python=process.env.MOMO_PYTHON||(process.platform==='win32'?'python':'python3');
  const server=spawn(python,['-u',path.join(rootPath,'app.py'),'--db',db,'--port','0'],{cwd:rootPath,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let diagnostics='';server.stderr.on('data',data=>diagnostics+=data);
  try{
    const address=await new Promise((resolve,reject)=>{
      let output='';const timer=setTimeout(()=>reject(Error('isolated HTTP startup timed out: '+diagnostics)),10000);
      server.once('error',error=>{clearTimeout(timer);reject(error);});
      server.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/Momo Planet: (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
      server.once('exit',code=>{clearTimeout(timer);reject(Error('isolated server exited '+code+': '+diagnostics));});
    });
    let n=0;const open=async()=>{
      globalThis.document=documentModel();const root=new Element('main');
      const store=new PersistentStore({storage:new MemoryStorage(),uuid:()=>'lesson-http-'+(++n),fetcher:(url,options)=>fetch(address+url,options)});
      const app=new App({root,pack,store,Session,uuid:()=>'lesson-app-'+(++n),player:{stop(){},async play(){return true;}}});
      await app.init();return {app,root,store};
    };
    let {app,root,store}=await open();
    await app.open('lesson');assert.equal(app.failure,null,JSON.stringify(app.failure));
    // word tap (introduced) on the words step, then a full story listen (story_listen), then skip on to the fill step.
    await root.querySelectorAll('.word-card').find(b=>!b.className.includes('review')).fire();assert.equal(app.failure,null,JSON.stringify(app.failure));
    await click(root,'下一步 / 跳过');await click(root,'听这一幕');assert.equal(app.failure,null,JSON.stringify(app.failure));
    for(let i=0;i<6;i++){await click(root,'下一步 / 跳过');assert.equal(app.failure,null);}
    let lesson=app.stateFor('lesson');assert.equal(lesson.step.kind,'fill');
    const fill=lesson.step,wrong=fill.options.find(o=>o!==fill.answer);
    await pick(root,wrong);assert.equal(app.failure,null,JSON.stringify(app.failure));assert.equal(lesson.attempts,1);
    // leave and come back: the wrong-answer count must survive the reload.
    await app.home();if(app.leaving)await app.leaving;
    ({app,root,store}=await open());
    lesson=app.stateFor('lesson');assert.equal(lesson.step.id,fill.id);assert.equal(lesson.attempts,1);
    await app.open('lesson');lesson=app.stateFor('lesson');assert.equal(lesson.step.id,fill.id);assert.equal(lesson.attempts,1);
    await pick(root,fill.answer);assert.equal(app.failure,null,JSON.stringify(app.failure));await click(root,'继续');
    // game: exactly one question, then the lesson moves on
    {
      const game=app.stateFor('game'),q=pack.modules.game.questions[game.index];
      await click(root,'听听要找什么');
      await root.querySelectorAll('button').find(b=>b.attributes['aria-label']==='选择'+app.word(q.target).cn).fire();
      assert.equal(app.failure,null,JSON.stringify(app.failure));assert(game.done);await click(root,'继续');
    }
    lesson=app.stateFor('lesson');assert.equal(lesson.step.kind,'match');
    while(!lesson.done){await pick(root,lesson.target);assert.equal(app.failure,null,JSON.stringify(app.failure));}
    await click(root,'继续');assert(root.textContent.includes('这节课完成啦'));
    await app.home();if(app.leaving)await app.leaving;
    const state=await store.state();
    const answers=state.events.filter(e=>e.kind==='choice'&&e.payload.mode==='lesson_answer');
    assert.deepEqual(answers.filter(a=>a.payload.stepId===fill.id).map(a=>[a.payload.correct,a.payload.attempt]).sort((a,b)=>a[1]-b[1]),[[false,1],[true,2]]);
    assert.equal(answers.filter(a=>a.payload.correct===false).length,1);
    assert.equal(answers.filter(a=>a.payload.stepId===pack.lesson.steps.find(s=>s.kind==='match').id&&a.payload.correct).length,pack.lesson.steps.find(s=>s.kind==='match').words.length);
    assert.equal(state.events.filter(e=>e.kind==='choice'&&e.payload.moduleId==='game').length,1);
    assert(state.events.some(e=>e.kind==='introduced'&&e.payload.moduleId==='lesson'));
    assert(state.events.some(e=>e.kind==='choice'&&e.payload.mode==='story_listen'&&e.payload.moduleId==='lesson'));
    assert(state.events.some(e=>e.kind==='sticker'));
    assert(state.events.some(e=>e.kind==='cleared'&&e.payload.sceneId==='park'),'cleared recorded');
    const progress=state.progress.find(p=>p.sceneId==='park'&&p.moduleId==='lesson');assert(progress,'lesson progress saved');assert.equal(progress.state.stepId,pack.lesson.steps.find(s=>s.kind==='end').id);
    assert.equal(state.progress.find(p=>p.moduleId==='game').state.finished,true);
    assert.equal(store.entries().length,0);assert.equal(state.pendingCount||0,0);
  }finally{
    if(server.exitCode===null){const stopped=once(server,'exit');server.kill();await stopped;}
    await fs.rm(path.resolve(temp),{recursive:true,force:true});
  }
});
