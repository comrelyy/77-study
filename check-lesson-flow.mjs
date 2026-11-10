import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {App} from './static/core/app.mjs';
import {MemoryStore} from './static/core/store.mjs';
import {Element,documentModel} from './tests/fake-dom.mjs';
const require=createRequire(import.meta.url),{Session}=require('./static/core/model.js'),catalog=require('./static/content/catalog.json');
const clone=x=>JSON.parse(JSON.stringify(x));
function button(root,label){const b=root.querySelectorAll('button').find(b=>b.textContent===label);assert(b,'missing button '+label);return b;}
function option(root,id){const b=root.querySelectorAll('button').find(b=>b.attributes['data-id']===id);assert(b,'missing option '+id);return b;}
async function fixture(pack,{fail=()=>false,nextScene,calls=[]}={}){
  globalThis.document=documentModel();const root=new Element('main'),played=[],store=new MemoryStore();let id=0;
  const app=new App({root,pack,store,Session,nextScene,scenes:[{id:'washing'},{id:'dressing'}],navigateScene:async(id,opts)=>{calls.push([id,opts?.focus]);},uuid:()=>String(++id),player:{stop(){},source:'local-file',async play(path){played.push(path);return !fail(path);}}});
  await app.init();return {app,root,store,played};
}
const answers=store=>[...store.events.values()].filter(e=>e.payload.mode==='lesson_answer').map(e=>e.payload);
async function playGameQuestion(app,root,pack){
  const game=app.stateFor('game'),g=pack.modules.game,q=g.questions[game.index];
  if(g.type==='story-order'){for(const word of q.solution)await button(root,q.labels[word]).fire();await button(root,'故事排好了').fire();}
  else if(g.type==='scene-find'){await button(root,'听听要找什么').fire();await root.querySelectorAll('button').find(b=>b.attributes['aria-label']==='选择'+app.word(q.target).cn).fire();}
  else if(g.type==='listen-pack'){await button(root,'听听要找什么').fire();await root.querySelectorAll('button').find(b=>b.attributes['aria-label']===app.word(q.target).cn).fire();}
  else{await root.querySelectorAll('button').find(b=>b.attributes['aria-label']===app.word(q.target).cn).fire();await button(root,'放到'+g.zones.find(z=>z.id===q.zone).label).fire();}
  assert(game.done);await button(root,'继续').fire();
}
async function toStep(env,kind){
  const {app,root}=env;
  for(let i=0;i<200&&app.stateFor('lesson').step.kind!==kind;i++){
    const s=app.stateFor('lesson');
    if(['words','story'].includes(s.step.kind))await button(root,'下一步 / 跳过').fire();
    else if(['quiz','fill'].includes(s.step.kind)){await option(root,s.correctId()).fire();await button(root,'继续').fire();}
    else throw Error('cannot pass '+s.step.kind+' on the way to '+kind);
  }
  assert.equal(app.stateFor('lesson').step.kind,kind);
}
async function walk(env,seen=[]){
  const {app,root}=env;let guard=0;
  while(!root.textContent.includes('这节课完成啦')&&guard++<300){
    const s=app.stateFor('lesson'),step=s.step;seen.push(step.kind);
    if(['words','story'].includes(step.kind))await button(root,'下一步 / 跳过').fire();
    else if(step.kind==='quiz'||step.kind==='fill'||step.kind==='reply'){await option(root,s.correctId()).fire();assert(s.done,step.id+' not done');await button(root,'继续').fire();}
    else if(step.kind==='match'){
      while(!s.done){const target=s.target;await root.querySelector('.lesson-target').fire();await option(root,target).fire();}
      await button(root,'继续').fire();
    }
    else if(step.kind==='game'){await playGameQuestion(app,root,app.pack);assert.equal(app.stateFor('lesson').step.kind,'match');assert(app.stateFor('game').finished);}
    else throw Error('unexpected step '+step.kind);
  }
  assert(root.textContent.includes('这节课完成啦'),'lesson did not finish');
}

test('every theme walks the lesson to the end',async()=>{
  for(const file of Object.values(catalog.scenes)){
    const pack=require('./static/'+file),env=await fixture(pack);env.app.open('lesson');
    assert.equal(env.app.view,'module',pack.sceneId);assert(env.root.querySelector('.lesson-progress'));
    await walk(env);
    const list=answers(env.store);assert(list.length>=2,pack.sceneId);assert(list.every(a=>a.correct===true&&a.moduleId==='lesson'),pack.sceneId);
    assert(env.root.querySelector('.lesson-progress'));
    const word=pack.modules.summary.length?env.root.textContent.includes(pack.words.find(w=>w.id===pack.modules.summary[0]).text):true;assert(word,pack.sceneId+' end lists words');
    const events=[...env.store.events.values()];
    assert(events.some(e=>e.payload.moduleId==='game'),pack.sceneId+' game events keep moduleId game');
    await button(env.root,'回首页').fire();assert.equal(env.app.view,'home');
    env.app.open('lesson',true);assert.equal(env.app.stateFor('lesson').index,0);
  }
});

test('reviewed park shows quiz and reply',async()=>{
  const pack=clone(require('./static/content/park.json'));pack.lesson.reviewed=true;
  const env=await fixture(pack);env.app.open('lesson');const seen=[],texts=new Set();
  const quizzes=pack.lesson.steps.filter(s=>s.kind==='quiz').map(s=>s.question);
  const {root,app}=env;let guard=0;
  while(!root.textContent.includes('这节课完成啦')&&guard++<300){
    const s=app.stateFor('lesson'),step=s.step;seen.push(step.kind);
    if(step.kind==='quiz'){assert(root.textContent.includes(step.question));texts.add(step.question);}
    if(step.kind==='reply'){
      const round=step.rounds[s.roundIndex],dlg=pack.modules.dialogue.find(d=>d.id===round.dialogueId),right=dlg.options.find(o=>o.id===round.answer);
      assert(root.textContent.includes(right.text));assert(root.textContent.includes(round.wrong.text));texts.add('reply');
    }
    if(['words','story'].includes(step.kind))await button(root,'下一步 / 跳过').fire();
    else if(['quiz','fill','reply'].includes(step.kind)){await option(root,s.correctId()).fire();await button(root,'继续').fire();}
    else if(step.kind==='match'){while(!s.done){const t=s.target;await option(root,t).fire();}await button(root,'继续').fire();}
    else if(step.kind==='game'){await playGameQuestion(app,root,pack);}
  }
  assert(seen.includes('quiz')&&seen.includes('reply'));assert.equal(texts.size,quizzes.length+1);
  assert(answers(env.store).every(a=>a.correct));
});

test('unreviewed park hides quiz and reply',async()=>{
  const env=await fixture(require('./static/content/park.json'));env.app.open('lesson');const seen=[];await walk(env,seen);
  assert(!seen.includes('quiz')&&!seen.includes('reply'));
});

test('wrong twice reveals and continues',async()=>{
  const pack=clone(require('./static/content/park.json'));pack.lesson.reviewed=true;
  const env=await fixture(pack);env.app.open('lesson');await toStep(env,'quiz');
  const s=env.app.stateFor('lesson'),step=s.step,wrong=step.options.find(o=>o!==step.answer);
  assert(!env.root.textContent.includes('继续上次'));assert.equal(env.root.querySelectorAll('button').filter(b=>b.textContent==='继续').length,0);
  await option(env.root,wrong).fire();
  assert(option(env.root,wrong).className.includes('lesson-shake'));assert(env.root.textContent.includes('再试试'));assert(!env.root.querySelector('.lesson-reveal'));
  await option(env.root,wrong).fire();
  assert(env.root.querySelector('.lesson-reveal'));assert.equal(env.root.querySelector('.lesson-reveal').attributes['data-id'],step.answer);button(env.root,'继续');
  assert.deepEqual(answers(env.store).map(a=>[a.correct,a.attempt,a.selectedId]),[[false,1,wrong],[false,2,wrong]]);
  assert(!/错\s*\d|答错了?\s*\d/.test(env.root.textContent));
  await button(env.root,'继续').fire();assert.notEqual(env.app.stateFor('lesson').step.id,step.id);
});

test('double click records one answer',async()=>{
  const env=await fixture(require('./static/content/park.json'));env.app.open('lesson');await toStep(env,'fill');
  const s=env.app.stateFor('lesson'),b=option(env.root,s.step.answer),first=b.fire(),second=b.fire();await Promise.all([first,second]);
  assert.equal(answers(env.store).length,1);assert.equal(s.attempts,0);assert(s.done);
});

test('missing lesson audio still answerable',async()=>{
  const pack=clone(require('./static/content/park.json'));pack.lesson.reviewed=true;
  const env=await fixture(pack,{fail:p=>p.includes('audio/park/lesson/')});env.app.open('lesson');await toStep(env,'reply');
  const s=env.app.stateFor('lesson'),round=s.step.rounds[s.roundIndex],replyId=s.step.id;
  await option(env.root,round.wrong.id).fire();
  assert(env.played.some(p=>p.includes('audio/park/lesson/')));assert(env.root.textContent.includes('声音暂停或不可用'));
  await option(env.root,round.answer).fire();assert(s.done);
  await button(env.root,'继续').fire();assert.notEqual(s.step.kind,'reply');
  assert.deepEqual(answers(env.store).filter(a=>a.stepId===replyId).map(a=>a.correct),[false,true]);
});

test('entering lesson does not autoplay',async()=>{
  const env=await fixture(require('./static/content/park.json'));env.app.open('lesson');
  assert.equal(env.played.length,0);await button(env.root,'下一步 / 跳过').fire();assert.equal(env.played.length,0);
});

test('home shows a single lesson entry',async()=>{
  const env=await fixture(require('./static/content/park.json'));
  const cards=env.root.querySelectorAll('.activity');assert.equal(cards.length,1);assert(cards[0].textContent.includes('开始这节课'));
  assert(!env.root.textContent.includes('选一段'),'hero copy talks about one lesson');assert(env.root.querySelector('.hero').textContent.includes('这节课'));
  for(const old of ['主题小故事','情景互动','单词汇总','游戏互动'])assert(!env.root.textContent.includes(old),old);
  env.app.open('lesson');env.app.home();assert(env.root.querySelector('.activity').textContent.includes('继续上次'));
});

test('story step plays each sentence once on click and saves story_listen after the last',async()=>{
  const env=await fixture(require('./static/content/park.json'));env.app.open('lesson');await button(env.root,'下一步 / 跳过').fire();
  const s=env.app.stateFor('lesson'),scene=s.story.scene;assert.equal(scene.id,s.step.storyId);
  assert.equal(env.root.querySelectorAll('.lesson-bubble').length,scene.segments.length);
  assert.equal(env.played.length,0);await env.root.querySelectorAll('.lesson-bubble')[0].fire();assert.equal(env.played.length,1);
  await button(env.root,'听这一幕').fire();
  assert.equal([...env.store.events.values()].filter(e=>e.payload.mode==='story_listen').length,1);
});

test('wrong double click records one wrong answer',async()=>{
  const env=await fixture(require('./static/content/park.json'));env.app.open('lesson');await toStep(env,'fill');
  const s=env.app.stateFor('lesson'),wrong=s.step.options.find(o=>o!==s.step.answer),b=option(env.root,wrong);
  await Promise.all([b.fire(),b.fire()]);
  const list=answers(env.store);assert.equal(list.length,1);assert.equal(list[0].correct,false);assert.equal(s.attempts,1);
});

test('one skip leaves the game step; a finished game does not trap it',async()=>{
  for(const finished of [false,true]){
    const env=await fixture(require('./static/content/park.json'));env.app.open('lesson');await toStep(env,'fill');
    const s=env.app.stateFor('lesson');await option(env.root,s.step.answer).fire();await button(env.root,'继续').fire();
    assert.equal(s.step.kind,'game');if(finished){env.app.stateFor('game').finished=true;env.app.draw();}
    await button(env.root,'先跳过').fire();
    assert.equal(s.step.kind,'match');assert(env.app.stateFor('game').finished);
  }
});

test('lesson game step starts from the first question even with old game progress',async()=>{
  for(const done of [false,true]){
    const env=await fixture(require('./static/content/park.json'));
    const old=env.app.stateFor('game');old.index=1;old.done=done;old.finished=done;
    env.app.open('lesson');await toStep(env,'game');
    const game=env.app.stateFor('game');assert.equal(game.index,0,'done='+done);assert.equal(game.done,false);assert.equal(game.finished,false);
  }
});

test('tapping a word keeps the words step usable',async()=>{
  const env=await fixture(require('./static/content/park.json'));env.app.open('lesson');
  await env.root.querySelectorAll('.word-card').find(b=>!b.className.includes('review')).fire();assert.equal([...env.store.events.values()].filter(e=>e.kind==='introduced').length,1);
  await button(env.root,'下一步 / 跳过').fire();assert.equal(env.app.stateFor('lesson').step.kind,'story');
});
test('step navigation jumps anywhere and 上一步 restarts the previous step',async()=>{
  const pack=require('./static/content/dressing.json'),env=await fixture(pack),{app,root}=env;app.open('lesson');
  assert.equal(root.querySelector('.lesson-steps').querySelectorAll('button').length,app.stateFor('lesson').steps.length);
  await button(root,'配一配').fire();assert.equal(app.stateFor('lesson').step.kind,'match');
  await button(root,'填一填').fire();const s=app.stateFor('lesson');assert.equal(s.step.kind,'fill');
  await option(root,s.step.options.find(x=>x!==s.correctId())).fire();assert.equal(s.attempts,1);
  await option(root,s.correctId()).fire();assert(s.done);await button(root,'继续').fire();assert.equal(s.step.kind,'game');
  await button(root,'填一填').fire();assert.equal(s.step.kind,'fill');assert.equal(s.done,false);assert.equal(s.attempts,0);
  await button(root,'上一步').fire();assert.equal(s.step.kind,'story');
  await button(root,'认识单词').fire();assert.equal(s.index,0);assert.equal(button(root,'上一步').disabled,true);
});

test('review card plays audio and emits nothing',async()=>{
  const pack=require('./static/content/dressing.json'),env=await fixture(pack);env.app.open('lesson');
  const cards=env.root.querySelectorAll('.word-card').filter(b=>b.className.includes('review')),review=pack.lesson.steps.find(s=>s.kind==='words').review;
  assert.equal(cards.length,3);assert(env.root.textContent.includes('先复习几个学过的词'));assert(cards[0].textContent.includes('复习 · 来自'+review[0].from));
  const before=env.store.events.size;await cards[0].fire();
  assert.deepEqual(env.played,[env.app.asset(review[0].audio).path]);
  assert.equal(env.store.events.size,before);assert.equal([...env.store.events.values()].filter(e=>e.kind==='introduced').length,0);
});
test('first scene has no review cards or hint',async()=>{
  const env=await fixture(require('./static/content/washing.json'));env.app.open('lesson');
  assert.equal(env.root.querySelectorAll('.word-card').filter(b=>b.className.includes('review')).length,0);assert(!env.root.textContent.includes('先复习几个学过的词'));
});
test('end step records cleared once per visit',async()=>{
  const env=await fixture(require('./static/content/park.json'));env.app.open('lesson');await walk(env);
  const cleared=()=>[...env.store.events.values()].filter(e=>e.kind==='cleared');
  assert.equal(cleared().length,1);assert.equal(cleared()[0].payload.sceneId,'park');assert.equal(cleared()[0].payload.moduleId,'lesson');
  env.app.draw();assert.equal(cleared().length,1);
});
test('end offers next stop',async()=>{
  const calls=[],env=await fixture(require('./static/content/dressing.json'),{nextScene:'breakfast',calls});env.app.scenes.push({id:'breakfast'});env.app.open('lesson');await walk(env);
  const play=button(env.root,'再玩一次');assert(!play.className.includes('primary'));
  await button(env.root,'去下一站').fire();assert.deepEqual(calls,[[null,'breakfast']]);
});
test('end without next stop keeps replay as the main button',async()=>{
  const env=await fixture(require('./static/content/park.json'));env.app.open('lesson');await walk(env);
  assert(!env.root.textContent.includes('去下一站'));assert(button(env.root,'再玩一次').className.includes('primary'));
});
test('theme home return button says 回地图',async()=>{
  const env=await fixture(require('./static/content/park.json'));assert.equal(env.root.querySelector('.theme-back').textContent,'← 回地图');
});
test('cleared dropped by the busy guard is retried on the next draw',async()=>{
  const env=await fixture(require('./static/content/park.json'));env.app.open('lesson');await walk(env);
  const cleared=()=>[...env.store.events.values()].filter(e=>e.kind==='cleared');
  for(const [k,e] of [...env.store.events])if(e.kind==='cleared')env.store.events.delete(k);
  env.app.stateFor('lesson').clearedSaved=false;env.app.busy=true;
  assert.equal(await env.app.markCleared(),false);assert.equal(cleared().length,0);
  env.app.busy=false;env.app.draw();await new Promise(r=>setTimeout(r));
  assert.equal(cleared().length,1);env.app.draw();await new Promise(r=>setTimeout(r));assert.equal(cleared().length,1);
});
