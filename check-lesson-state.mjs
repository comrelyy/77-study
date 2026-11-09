import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {missingBootAssets} from './static/core/boot-assets.mjs';
import {LessonState} from './static/core/lesson-state.mjs';
import {serializeProgress,restoreProgress} from './static/core/progress.mjs';
const require=createRequire(import.meta.url),park=require('./static/content/park.json'),tidy=require('./static/content/tidy.json');
const reviewed=()=>{const p=structuredClone(park);p.lesson.reviewed=true;return p;};
function goto(s,id){let n=0;while(s.step.id!==id){assert(s.next(),'no step '+id);assert(++n<100);}return s;}
const wrongOf=(step)=>step.options.find(x=>x!==step.answer);
function record(pack,s){const r=serializeProgress(pack,'lesson',s);r.compatible=true;return r;}

test('unreviewed lesson skips quiz and reply',()=>{
  const s=new LessonState(park);
  assert(s.steps.length>0);
  assert(!s.steps.some(x=>x.kind==='quiz'||x.kind==='reply'));
  assert(new LessonState(reviewed()).steps.some(x=>x.kind==='quiz'));
});
test('two wrong answers reveal',()=>{
  const s=goto(new LessonState(reviewed()),'park.lesson.quiz.1'),w=wrongOf(s.step);
  assert.equal(s.canContinue(),false);
  assert.deepEqual(s.answer(w),{correct:false,revealed:false,finished:false});
  assert.equal(s.attempts,1);assert.equal(s.canContinue(),false);
  assert.deepEqual(s.answer(w),{correct:false,revealed:true,finished:false});
  assert.equal(s.revealed,true);assert.equal(s.canContinue(),true);
});
test('correct answer finishes step',()=>{
  const s=goto(new LessonState(reviewed()),'park.lesson.quiz.1');
  assert.deepEqual(s.answer(s.step.answer),{correct:true,revealed:false,finished:true});
  assert.equal(s.canContinue(),true);
  const i=s.index;assert.equal(s.next(),true);assert.equal(s.index,i+1);assert.equal(s.attempts,0);
});
test('match pairs one by one',()=>{
  const s=goto(new LessonState(park),'park.lesson.match'),words=s.step.words;
  for(let i=0;i<words.length;i++){
    assert.equal(s.target,words[i]);
    if(i===1){assert.equal(s.answer(words[3]).correct,false);assert.equal(s.attempts,1);}
    const r=s.answer(words[i]);
    assert.equal(r.correct,true);assert.equal(r.finished,i===words.length-1);
    assert.equal(s.attempts,0);assert.equal(s.revealed,false);
  }
  assert.equal(s.matched.size,words.length);assert.equal(s.canContinue(),true);
});
test('reply round is chosen once',()=>{
  let calls=0;const p=reviewed(),s=goto(new LessonState(p,{random:()=>{calls++;return 0.99;}}),'park.lesson.reply');
  assert.equal(calls,1);
  assert.equal(s.roundIndex,s.step.rounds.length-1);
  s.answer('x');s.answer(s.step.rounds[s.roundIndex].answer);
  assert.equal(s.roundIndex,s.step.rounds.length-1);assert.equal(calls,1);
});
test('restores attempts and reveal after reload',()=>{
  const p=reviewed(),s=goto(new LessonState(p),'park.lesson.quiz.2');s.practiceId='p1';
  s.answer(wrongOf(s.step));
  const rec=record(p,s),t=new LessonState(p);
  assert.equal(restoreProgress(p,'lesson',t,rec),true);
  assert.equal(t.step.id,'park.lesson.quiz.2');assert.equal(t.attempts,1);assert.equal(t.practiceId,'p1');
  assert.equal(t.answer(wrongOf(t.step)).revealed,true);
});
test('restores match, reply round and story position',()=>{
  const p=reviewed();
  let s=goto(new LessonState(p),'park.lesson.match');s.practiceId='p';s.answer(s.target);
  let t=new LessonState(p);assert(restoreProgress(p,'lesson',t,record(p,s)));
  assert.deepEqual([...t.matched],[...s.matched]);assert.equal(t.target,s.step.words[1]);
  s=goto(new LessonState(p,{random:()=>0.5}),'park.lesson.reply');s.practiceId='p';
  t=new LessonState(p,{random:()=>0});assert(restoreProgress(p,'lesson',t,record(p,s)));assert.equal(t.roundIndex,s.roundIndex);
  s=goto(new LessonState(p),'park.lesson.story.2');s.practiceId='p';
  s.story.heard.add(s.story.scene.segments[0].id);s.story.fragment=1;
  const rec=record(p,s);assert.equal(rec.state.fragmentId,s.story.scene.segments[1].id);
  t=new LessonState(p);assert(restoreProgress(p,'lesson',t,rec));
  assert.equal(t.story.fragment,1);assert(t.story.heard.has(s.story.scene.segments[0].id));
});
test('stale lesson progress starts over',()=>{
  const p=reviewed(),s=goto(new LessonState(p),'park.lesson.quiz.1');s.practiceId='p';
  const rec=record(p,s);rec.state.stepId='park.lesson.gone';
  assert.equal(restoreProgress(p,'lesson',new LessonState(p),rec),false);
  // a quiz step is not in the unreviewed pack's filtered steps
  const rec2=record(p,s);assert.equal(restoreProgress(park,'lesson',new LessonState(park),rec2),false);
  const bad=record(p,s);bad.state.attempts=-1;assert.equal(restoreProgress(p,'lesson',new LessonState(p),bad),false);
  const bad2=record(p,s);bad2.state.matched=['en.x'];assert.equal(restoreProgress(p,'lesson',new LessonState(p),bad2),false);
});
test('tidy three words',()=>{
  const s=goto(new LessonState(tidy),tidy.lesson.steps.find(x=>x.kind==='match').id);
  assert.equal(s.step.words.length,3);
  const r=[0,1,2].map(()=>s.answer(s.target));
  assert.deepEqual(r.map(x=>x.finished),[false,false,true]);
});
test('fully matched step is continuable after reload',()=>{
  const s=goto(new LessonState(park),'park.lesson.match');s.practiceId='p';
  while(s.target)s.answer(s.target);
  const t=new LessonState(park),i=s.index;assert(restoreProgress(park,'lesson',t,record(park,s)));
  assert.equal(t.canContinue(),true);assert.equal(t.next(),true);assert.equal(t.index,i+1);
});
test('failed restore leaves target untouched',()=>{
  const s=goto(new LessonState(park),'park.lesson.story.2');s.practiceId='p';
  const rec=record(park,s);rec.state.heard=['nope'];
  const t=new LessonState(park);assert.equal(restoreProgress(park,'lesson',t,rec),false);
  assert.equal(t.index,0);assert.equal(t.practiceId,null);
});

test('boot asset check skips lesson audio but still fails a missing ordinary asset',async()=>{
  const lessonAsset=park.assets.find(a=>String(a.id).includes('.lesson.'));
  assert(lessonAsset,'park has lesson assets');
  const normal=park.assets.find(a=>!String(a.id).includes('.lesson.'));
  assert.deepEqual(await missingBootAssets(park,async path=>path!==lessonAsset.path),[]);
  assert.deepEqual(await missingBootAssets(park,async path=>path!==normal.path),[normal.path]);
  assert.deepEqual(await missingBootAssets(park,async()=>false),park.assets.filter(a=>!String(a.id).includes('.lesson.')).map(a=>a.path));
});
