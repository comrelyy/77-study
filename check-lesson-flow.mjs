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
async function fixture(pack,{fail=()=>false,nextScene,calls=[],manual=false}={}){
  globalThis.document=documentModel();const root=new Element('main'),played=[],store=new MemoryStore(),waiting=[];let id=0;
  const player={stop(){for(const r of waiting.splice(0))r(false);},source:'local-file',play(path){played.push(path);if(!manual)return Promise.resolve(!fail(path));return new Promise(r=>waiting.push(r));}};
  const app=new App({root,pack,store,Session,nextScene,scenes:[{id:'washing'},{id:'dressing'}],navigateScene:async(id,opts)=>{calls.push([id,opts?.focus]);},uuid:()=>String(++id),player});
  await app.init();return {app,root,store,played,waiting};
}
// Answers a picture quiz: tapping only selects (and plays the word), 找到了 submits; a standalone quiz page then shows 继续.
async function answerQuiz(root,s,id=s.correctId()){
  const at=s.step.id,box=root.querySelectorAll('.lesson-quiz').find(q=>q.attributes['data-step']===at);assert(box,'missing quiz '+at);
  await option(box,id).fire();await button(box,'找到了').fire();
  if(s.step.id===at&&s.canContinue())await button(root,'继续').fire();
}
const pathOf=(pack,id)=>pack.assets.find(a=>a.id===id).path;
const linePaths=(pack,from=0,fragment=0)=>pack.modules.story.slice(from).flatMap((sc,i)=>sc.segments.slice(i?0:fragment).map(x=>pathOf(pack,x.audio)));
const listens=store=>[...store.events.values()].filter(e=>e.payload.mode==='story_listen').map(e=>e.payload.stepId);
async function until(condition,label='condition'){for(let i=0;i<200;i++){if(condition())return;await new Promise(r=>setTimeout(r));}assert(condition(),label);}
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
    else if(s.step.kind==='quiz')await answerQuiz(root,s);
    else if(s.step.kind==='fill'){await option(root,s.correctId()).fire();await button(root,'继续').fire();}
    else throw Error('cannot pass '+s.step.kind+' on the way to '+kind);
  }
  assert.equal(app.stateFor('lesson').step.kind,kind);
}
async function walk(env,seen=[]){
  const {app,root}=env;let guard=0;
  while(!root.textContent.includes('这节课完成啦')&&guard++<300){
    const s=app.stateFor('lesson'),step=s.step;seen.push(step.kind);
    if(['words','story'].includes(step.kind))await button(root,'下一步 / 跳过').fire();
    else if(step.kind==='quiz')await answerQuiz(root,s);
    else if(step.kind==='fill'||step.kind==='reply'){await option(root,s.correctId()).fire();assert(s.done,step.id+' not done');await button(root,'继续').fire();}
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
    assert(button(env.root,'回地图'));
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
    else if(step.kind==='quiz')await answerQuiz(root,s);
    else if(['fill','reply'].includes(step.kind)){await option(root,s.correctId()).fire();await button(root,'继续').fire();}
    else if(step.kind==='match'){while(!s.done){const t=s.target;await option(root,t).fire();}await button(root,'继续').fire();}
    else if(step.kind==='game'){await playGameQuestion(app,root,pack);}
  }
  assert(seen.includes('quiz')&&seen.includes('reply'),seen.join());assert.equal(texts.size,quizzes.length+1);
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
  assert(s.inStory(),'the first quiz sits inside the story page');
  assert(!env.root.textContent.includes('继续上次'));assert.equal(env.root.querySelectorAll('button').filter(b=>b.textContent==='继续').length,0);
  await option(env.root,wrong).fire();await button(env.root,'找到了').fire();
  assert(option(env.root,wrong).className.includes('lesson-shake'));assert(env.root.textContent.includes('再试试'));assert(!env.root.querySelector('.lesson-reveal'));assert.equal(s.step.id,step.id);
  await option(env.root,wrong).fire();await button(env.root,'找到了').fire();
  assert(env.root.querySelector('.lesson-reveal'));assert.equal(env.root.querySelector('.lesson-reveal').attributes['data-id'],step.answer);
  assert.deepEqual(answers(env.store).map(a=>[a.correct,a.attempt,a.selectedId]),[[false,1,wrong],[false,2,wrong]]);
  assert(!/错\s*\d|答错了?\s*\d/.test(env.root.textContent));
  // a revealed inline quiz lets the story carry on by itself, up to the next quiz
  assert.notEqual(s.step.id,step.id);assert.equal(s.step.kind,'quiz');
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

test('entering lesson does not autoplay the words step',async()=>{
  const env=await fixture(require('./static/content/park.json'));env.app.open('lesson');
  assert.equal(env.app.stateFor('lesson').step.kind,'words');assert.equal(env.played.length,0);
});

test('home shows a single lesson entry',async()=>{
  const env=await fixture(require('./static/content/park.json'));
  const cards=env.root.querySelectorAll('.activity');assert.equal(cards.length,1);assert(cards[0].textContent.includes('开始这节课'));
  assert(!env.root.textContent.includes('选一段'),'hero copy talks about one lesson');assert(env.root.querySelector('.hero').textContent.includes('这节课'));
  for(const old of ['主题小故事','情景互动','单词汇总','游戏互动'])assert(!env.root.textContent.includes(old),old);
  env.app.open('lesson');env.app.home();assert(env.root.querySelector('.activity').textContent.includes('继续上次'));
});

test('a story line bubble plays just that line',async()=>{
  const pack=require('./static/content/park.json'),env=await fixture(pack);env.app.open('lesson');await button(env.root,'下一步 / 跳过').fire();
  env.played.length=0;const seg=pack.modules.story[2].segments[1];
  await env.root.querySelectorAll('.lesson-bubble')[pack.modules.story[0].segments.length+pack.modules.story[1].segments.length+1].fire();
  assert.deepEqual(env.played,[pathOf(pack,seg.audio)]);
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
  const lesson=app.stateFor('lesson');assert.equal(root.querySelector('.lesson-steps').querySelectorAll('button').length,lesson.steps.length-(lesson.storyLast-lesson.storyFirst));
  await button(root,'配一配').fire();assert.equal(app.stateFor('lesson').step.kind,'match');
  await button(root,'填一填').fire();const s=app.stateFor('lesson');assert.equal(s.step.kind,'fill');
  await option(root,s.step.options.find(x=>x!==s.correctId())).fire();assert.equal(s.attempts,1);
  await option(root,s.correctId()).fire();assert(s.done);await button(root,'继续').fire();assert.equal(s.step.kind,'game');
  await button(root,'填一填').fire();assert.equal(s.step.kind,'fill');assert.equal(s.done,false);assert.equal(s.attempts,0);
  await button(root,'上一步').fire();assert.equal(s.step.kind,'story');assert.equal(s.index,s.storyLast);
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
test('next stop retries a dropped cleared save before navigating',async()=>{
  const calls=[],env=await fixture(require('./static/content/dressing.json'),{nextScene:'breakfast',calls});env.app.scenes.push({id:'breakfast'});env.app.open('lesson');await walk(env);
  const cleared=()=>[...env.store.events.values()].filter(e=>e.kind==='cleared');
  for(const [k,e] of [...env.store.events])if(e.kind==='cleared')env.store.events.delete(k);
  env.app.stateFor('lesson').clearedSaved=false;env.app.busy=true;
  assert.equal(await env.app.markCleared(),false);env.app.busy=false;assert.equal(cleared().length,0);
  const seen=[];const nav=env.app.navigateScene;env.app.navigateScene=(...a)=>{seen.push(cleared().length);return nav(...a);};
  await button(env.root,'去下一站').fire();
  assert.deepEqual(seen,[1]);assert.equal(cleared().length,1);assert.deepEqual(calls,[[null,'breakfast']]);
});
test('map button leaves the lesson end page for the map',async()=>{
  const calls=[],env=await fixture(require('./static/content/park.json'),{calls});env.app.open('lesson');await walk(env);
  await button(env.root,'回地图').fire();assert.deepEqual(calls,[[null,undefined]]);
});

// ---- one-step story page ----
test('lesson state groups the story run from the first to the last story step',async()=>{
  const {LessonState}=await import('./static/core/lesson-state.mjs');
  const park=require('./static/content/park.json'),s=new LessonState(park);
  assert.deepEqual([s.storyFirst,s.storyLast],[1,6]);assert(s.inStory(1)&&s.inStory(6)&&!s.inStory(0)&&!s.inStory(7));
  const reviewed=clone(park);reviewed.lesson.reviewed=true;const r=new LessonState(reviewed);
  assert.deepEqual([r.storyFirst,r.storyLast],[1,8]);assert.equal(r.steps[3].kind,'quiz');assert(r.inStory(3));assert.equal(r.steps[9].kind,'quiz');assert(!r.inStory(9),'a quiz after the last scene keeps its own page');
});
test('the story run is one 故事 nav entry that restarts from the title',async()=>{
  const pack=require('./static/content/park.json'),env=await fixture(pack),{app,root}=env;app.open('lesson');
  const names=()=>root.querySelector('.lesson-steps').querySelectorAll('button').map(b=>b.textContent);
  assert.deepEqual(names().filter(n=>n==='故事'),['故事']);for(const sc of pack.modules.story)assert(!names().includes(sc.title));
  await button(root,'故事').fire();const s=app.stateFor('lesson');
  assert.equal(env.played[0],pathOf(pack,pack.lesson.title.audio));assert.deepEqual(env.played.slice(1),linePaths(pack));
  assert.equal(s.index,s.storyLast);assert(button(root,'故事').className.includes('current'));assert.equal(button(root,'故事').attributes['aria-current'],'step');
  s.goTo(3);app.draw();assert(button(root,'故事').className.includes('current'));
  env.played.length=0;await button(root,'故事').fire();assert.equal(env.played[0],pathOf(pack,pack.lesson.title.audio));assert.equal(env.played.length,1+linePaths(pack).length);
});
test('story page shows the English title, each scene picture as a divider and every line',async()=>{
  const pack=require('./static/content/park.json'),env=await fixture(pack),{app,root}=env;app.open('lesson');await button(root,'下一步 / 跳过').fire();
  assert.equal(root.querySelector('.lesson-title').textContent,pack.lesson.title.text);
  const dividers=root.querySelectorAll('.story-divider');assert.equal(dividers.length,pack.modules.story.length);
  assert.deepEqual(dividers.map(d=>d.querySelector('img').src.split('?')[0]),pack.modules.story.map(sc=>pathOf(pack,sc.illustration)));
  assert.equal(root.querySelectorAll('.lesson-bubble').length,linePaths(pack).length);assert.equal(root.querySelectorAll('.cn-toggle').length,pack.modules.story.flatMap(sc=>sc.segments).filter(x=>x.cn).length);
  for(const old of ['听这一幕','继续这一幕'])assert(!root.querySelectorAll('button').some(b=>b.textContent===old),old);
  button(root,'从头听');button(root,'暂停声音');button(root,'听听怎么玩');button(root,'上一步');
});
test('下一步 from words autoplays title then every line once, story_listen once per scene, then 下一步 leaves the run',async()=>{
  const pack=require('./static/content/park.json'),env=await fixture(pack),{app,root,store}=env;app.open('lesson');assert.equal(env.played.length,0);
  await button(root,'下一步 / 跳过').fire();const s=app.stateFor('lesson');
  assert.deepEqual(env.played,[pathOf(pack,pack.lesson.title.audio),...linePaths(pack)]);
  assert.deepEqual(listens(store),pack.modules.story.map(sc=>sc.id));assert.equal(s.index,s.storyLast);
  assert(root.querySelectorAll('button').filter(b=>b.textContent!=='暂停声音').every(b=>!b.disabled||b.textContent==='上一步'&&s.storyFirst===0),'no button left disabled by the saves');
  assert(button(root,'接着听故事').hidden,'nothing left to resume');assert(button(root,'下一步 / 跳过').className.includes('primary'));
  await button(root,'下一步 / 跳过').fire();assert.equal(s.index,s.storyLast+1);assert.equal(s.step.kind,'fill');
});
test('a pack without an English title starts with the first line',async()=>{
  const pack=clone(require('./static/content/park.json'));delete pack.lesson.title;
  const env=await fixture(pack);env.app.open('lesson');await button(env.root,'下一步 / 跳过').fire();
  assert.deepEqual(env.played,linePaths(pack));assert.equal(env.root.querySelector('.lesson-title').textContent,pack.title);
});
test('the line being read is highlighted, without a redraw, while s.index follows the scene',async()=>{
  const pack=require('./static/content/park.json'),env=await fixture(pack,{manual:true}),{app,root,waiting}=env;app.open('lesson');
  const done=button(root,'下一步 / 跳过').fire();await until(()=>waiting.length===1);const s=app.stateFor('lesson'),generation=app.generation;
  assert(root.querySelector('.lesson-title').className.includes('current-fragment'),'title read first');
  const first=pack.modules.story[0].segments.length;
  for(let i=0;i<first+1;i++){waiting.shift()(true);await until(()=>waiting.length===1);}
  const bubbles=root.querySelectorAll('.lesson-bubble');
  assert(bubbles[first].className.includes('current-fragment'));assert.equal(root.querySelectorAll('.current-fragment').length,1);
  assert.equal(s.step.storyId,pack.modules.story[1].id);assert.equal(app.generation,generation,'no redraw while reading');
  assert.deepEqual(listens(env.store),[pack.modules.story[0].id]);
  app.pause();await done;
});
test('暂停声音 stops the chain; 接着听故事 continues from the interrupted line',async()=>{
  const pack=require('./static/content/park.json'),env=await fixture(pack,{manual:true}),{app,root,waiting}=env;app.open('lesson');
  const done=button(root,'下一步 / 跳过').fire();await until(()=>waiting.length===1);
  for(let i=0;i<3;i++){waiting.shift()(true);await until(()=>waiting.length===1);}
  assert(button(root,'接着听故事').hidden);
  await button(root,'暂停声音').fire();await done;const count=env.played.length;await new Promise(r=>setTimeout(r,5));
  assert.equal(env.played.length,count,'nothing plays after pause');assert.equal(waiting.length,0);
  const resume=button(root,'接着听故事');assert(!resume.hidden);assert(!resume.disabled);
  env.played.length=0;const again=resume.fire();await until(()=>waiting.length===1);assert(resume.hidden);
  assert.equal(env.played[0],linePaths(pack)[2],'the interrupted third line plays again');
  app.player.stop();await again;
});
test('resume into the middle of the story does not autoplay; 接着听故事 continues from the saved line',async()=>{
  const {serializeProgress,restoreProgress}=await import('./static/core/progress.mjs');const {LessonState}=await import('./static/core/lesson-state.mjs');
  const pack=require('./static/content/park.json'),saved=new LessonState(pack);saved.goTo(3);saved.story.fragment=2;saved.story.heard=new Set(pack.modules.story[2].segments.slice(0,2).map(x=>x.id));saved.practiceId='p';
  const record={...serializeProgress(pack,'lesson',saved),compatible:true};
  const env=await fixture(pack),{app,root}=env;assert(restoreProgress(pack,'lesson',app.stateFor('lesson'),record));app.open('lesson');
  assert.equal(env.played.length,0);const resume=button(root,'接着听故事');assert(!resume.hidden);assert(resume.className.includes('primary'));
  const bubbles=root.querySelectorAll('.lesson-bubble'),at=pack.modules.story[0].segments.length+pack.modules.story[1].segments.length+2;
  assert(bubbles[at].className.includes('current-fragment'),'saved line is marked');
  await resume.fire();assert.deepEqual(env.played,linePaths(pack,2,2));
  assert.deepEqual(listens(env.store),pack.modules.story.slice(2).map(sc=>sc.id));
});
test('reviewed story stops at each inline quiz; tap selects and speaks, 找到了 submits, then the story continues',async()=>{
  const pack=clone(require('./static/content/park.json'));pack.lesson.reviewed=true;
  const env=await fixture(pack),{app,root,store}=env;app.open('lesson');await button(root,'下一步 / 跳过').fire();
  const s=app.stateFor('lesson'),quiz=s.step;assert.equal(quiz.kind,'quiz');assert.equal(quiz.id,'park.lesson.quiz.1');
  assert.deepEqual(env.played.slice(1),linePaths(pack).slice(0,pack.modules.story[0].segments.length+pack.modules.story[1].segments.length),'stops after scene 2');
  assert(root.textContent.includes(quiz.question));for(const q of pack.lesson.steps.filter(x=>x.kind==='quiz').slice(0,2))assert(root.textContent.includes(q.question),q.id);
  const found=button(root,'找到了');assert(found.disabled,'nothing selected yet');assert(button(root,'接着听故事').hidden);
  const later=root.querySelectorAll('.lesson-quiz').find(q=>q.attributes['data-step']==='park.lesson.quiz.2').querySelectorAll('button');assert(later.length>1);assert(later.every(b=>b.disabled),'a later quiz waits');
  const wrong=quiz.options.find(o=>o!==quiz.answer);env.played.length=0;
  await option(root,wrong).fire();assert.deepEqual(env.played,[pathOf(pack,app.word(wrong).audio)]);assert.equal(option(root,wrong).attributes['aria-pressed'],'true');assert(option(root,wrong).className.includes('lesson-selected'));
  assert.equal(answers(store).length,0,'tapping a picture never submits');assert(!found.disabled);
  await option(root,quiz.answer).fire();assert.equal(option(root,wrong).attributes['aria-pressed'],'false');assert.equal(option(root,quiz.answer).attributes['aria-pressed'],'true');
  env.played.length=0;await button(root,'找到了').fire();
  assert.deepEqual(answers(store).map(a=>[a.stepId,a.selectedId,a.correct]),[[quiz.id,quiz.answer,true]]);
  assert.equal(env.played[0],pathOf(pack,app.word(quiz.answer).audio));
  assert.deepEqual(env.played.slice(1),linePaths(pack,2).slice(0,pack.modules.story[2].segments.length+pack.modules.story[3].segments.length));
  assert.equal(s.step.id,'park.lesson.quiz.2');
});
test('从头听 restarts from the title',async()=>{
  const pack=require('./static/content/park.json'),env=await fixture(pack);env.app.open('lesson');await button(env.root,'下一步 / 跳过').fire();
  env.played.length=0;await button(env.root,'从头听').fire();assert.deepEqual(env.played,[pathOf(pack,pack.lesson.title.audio),...linePaths(pack)]);
});
test('the quiz after the last scene keeps its own page with select then 找到了',async()=>{
  const pack=clone(require('./static/content/park.json'));pack.lesson.reviewed=true;
  const env=await fixture(pack),{app,root}=env;app.open('lesson');const s=app.stateFor('lesson');s.goTo(s.storyLast+1);app.draw();
  assert.equal(s.step.id,'park.lesson.quiz.3');assert(!root.querySelector('.story-divider'));
  await option(root,s.step.answer).fire();assert.equal(answers(env.store).length,0);
  await button(root,'找到了').fire();assert(s.done);await button(root,'继续').fire();assert.equal(s.step.kind,'fill');
  await button(root,'上一步').fire();assert.equal(s.step.kind,'quiz');await button(root,'上一步').fire();assert.equal(s.index,s.storyLast);
});
