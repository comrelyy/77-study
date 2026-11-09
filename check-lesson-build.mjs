import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {buildLesson,finalizeLesson,stripLesson}=require('./lesson-build.cjs'),{validate}=require('./static/core/model.js');
// park/tidy fixtures are archived pre-lesson packs, stable after build-content adds lessons.
const catalog=require('./static/content/catalog.json'),overlay=require('./content-lesson/park.json');
const packs=Object.values(catalog.scenes).map(f=>require('./static/'+f)),park=require('./static/content/archive/park.0.2.0.json'),tidy=require('./static/content/archive/tidy.0.5.0.json');
const kinds=l=>l.steps.map(s=>s.kind),clone=x=>JSON.parse(JSON.stringify(x));
const build=(p=park,o=overlay)=>buildLesson(stripLesson(p),o);

test('every catalog pack builds a lesson without overlay',()=>{
  for(const pack of packs){
    const {lesson,warnings}=buildLesson(stripLesson(pack),null),n=pack.modules.story.length;
    const noFill=warnings.some(w=>w.includes('fill'));
    assert.deepEqual(kinds(lesson),['words',...Array(n).fill('story'),...(noFill?[]:['fill']),'game','match','end'],pack.sceneId);
    assert.equal(lesson.reviewed,false);
  }
});
test('park overlay inserts quiz after scenes 2/4/6 and one reply step',()=>{
  const {lesson,warnings}=build();assert.deepEqual(warnings,[]);
  const seq=kinds(lesson).join(' ');
  assert(seq.startsWith('words story story quiz story story quiz story story quiz fill reply game match end'),seq);
  const reply=lesson.steps.find(s=>s.kind==='reply');
  assert.equal(reply.rounds.length,6);
  reply.rounds.forEach((r,i)=>assert.equal(r.answer,park.modules.dialogue[i].options[0].id));
  for(const s of lesson.steps.filter(s=>s.kind==='quiz'||s.kind==='reply'))assert.equal(s.review,true);
  assert.equal(lesson.reviewed,false);
  assert.equal(new Set(lesson.steps.map(s=>s.id)).size,lesson.steps.length);
});
test('tidy builds three-pair match',()=>{
  const {lesson}=build(tidy,null);
  assert.equal(lesson.steps.find(s=>s.kind==='match').words.length,3);
  assert.equal(lesson.steps.find(s=>s.kind==='fill').options.length,3);
});
test('fill blanks one lesson word',()=>{
  for(const pack of packs){
    const fill=build(pack,null).lesson.steps.find(s=>s.kind==='fill');if(!fill)continue;
    const seg=pack.modules.story.flatMap(s=>s.segments).find(s=>s.id===fill.segmentId),word=pack.words.find(w=>w.id===fill.answer);
    assert.equal((fill.before+word.text+fill.after).toLowerCase(),seg.text.toLowerCase(),pack.sceneId);
    assert(fill.options.includes(fill.answer));
  }
});
test('stale overlay is ignored',()=>{
  const {lesson,warnings}=build(park,{...overlay,sourceVersion:'0.0.1'});
  assert(!kinds(lesson).some(k=>k==='quiz'||k==='reply'));
  assert(warnings.some(w=>w.includes('题目基于旧内容')));
});
test('invalid overlay content is ignored whole',()=>{
  const bad=clone(overlay);bad.quiz[0].answer='zebra';
  const {lesson,warnings}=build(park,bad);
  assert(!kinds(lesson).some(k=>k==='quiz'||k==='reply'));assert.equal(warnings.length,1);
});
test('wrong reply audio path changes with text',()=>{
  const other=clone(overlay);other.replies[0].text='I want my red ball.';
  const a=build(),b=build(park,other);
  const wa=a.lesson.steps.find(s=>s.kind==='reply').rounds[0].wrong,wb=b.lesson.steps.find(s=>s.kind==='reply').rounds[0].wrong;
  assert.notEqual(wa.audio,wb.audio);
  assert.notEqual(a.assets[0].path,b.assets[0].path);
  assert.equal(a.assets.find(x=>x.id===wa.audio).text,'I want my ball.');
});
test('finalize keeps version when unchanged',()=>{
  const first=finalizeLesson(park,overlay,park).pack,again=finalizeLesson(park,overlay,first).pack;
  assert.equal(again.contentVersion,first.contentVersion);assert.deepEqual(again,first);
});
test('finalize bumps patch when lesson changes',()=>{
  const prev=finalizeLesson(park,overlay,null).pack;prev.contentVersion='0.2.1';
  const other=clone(overlay);other.replies[0].text='I want my red ball.';
  const next=finalizeLesson(park,other,prev).pack;
  assert.equal(next.contentVersion,'0.2.2');assert(next.compatibleFrom.includes('0.2.1'));
  assert.equal(next.lesson.baseVersion,'0.2.0');
});
test('finalize keeps author bump',()=>{
  const base=clone(park);base.contentVersion='0.3.0';
  const prev=finalizeLesson(park,null,null).pack;prev.contentVersion='0.2.5';
  assert.equal(finalizeLesson(base,null,prev).pack.contentVersion,'0.3.0');
});
test('stripLesson restores the base pack',()=>{
  const {pack}=finalizeLesson(park,overlay,park);
  assert.deepEqual(stripLesson(pack),{...park,compatibleFrom:pack.compatibleFrom});
});
test('finalized pack validates',()=>{
  for(const pack of [finalizeLesson(park,overlay,null).pack,...packs.map(p=>finalizeLesson(p,null,null).pack)])
    assert.deepEqual(validate(pack,{exists:()=>true}).errors,[],pack.sceneId);
});
test('lesson validation rejects bad answers',()=>{
  const fresh=()=>clone(finalizeLesson(park,overlay,null).pack),errs=p=>validate(p,{exists:()=>true}).errors;
  const step=(p,k)=>p.lesson.steps.find(s=>s.kind===k);
  let p=fresh(),q=step(p,'quiz');q.answer=park.words.find(w=>!q.options.includes(w.id)).id;
  assert(errs(p).some(e=>e.startsWith(q.id+': ')),'quiz answer outside options');
  p=fresh();const r=step(p,'reply');r.rounds[0].wrong.text='one two three four five six seven eight nine';
  assert(errs(p).some(e=>e.startsWith(r.id+': ')||e.includes(r.rounds[0].wrong.id)),'9-word wrong reply');
  p=fresh();p.lesson.steps.pop();assert(errs(p).some(e=>e.startsWith('lesson: ')),'missing end');
  p=fresh();p.lesson.steps[0].words=['nope'];assert(errs(p).some(e=>e.includes('nope')),'unknown word');
  p=fresh();const f=step(p,'fill');f.after+='x';assert(errs(p).some(e=>e.startsWith(f.id+': ')),'fill mismatch');
  p=fresh();p.lesson.steps.find(s=>s.kind==='story').storyId='nope.story';assert(errs(p).some(e=>e.includes('nope.story')),'unknown story');
  p=fresh();p.lesson.schemaVersion=2;assert(errs(p).some(e=>e.startsWith('lesson: ')),'schemaVersion');
  p=fresh();p.lesson.steps[1].kind='bogus';assert(errs(p).some(e=>e.includes('bogus')||e.includes('unknown')),'bad kind');
  p=fresh();step(p,'reply').rounds[0].wrong.audio=park.words[0].audio;assert(errs(p).length>0,'wrong audio text mismatch');
  assert.deepEqual(errs(clone(park)),[]);
});

test('built catalog packs carry lessons; only park has quiz/reply',()=>{
  const all=Object.keys(catalog.scenes);
  assert(all.includes('birthday'));
  for(const id of all){
    const p=require('./static/content/'+id+'.json'),ks=kinds(p.lesson);
    assert(p.lesson,id);
    const extra=ks.some(k=>k==='quiz'||k==='reply');
    assert.equal(extra,id==='park',id);
    if(id==='park')assert.equal(p.lesson.reviewed,false);
  }
});
