const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {Session,validate}=require('./static/dev/model.js');
const picnic=require('./static/dev/content/picnic.json'),tidy=require('./static/dev/content/tidy.json');
const copy=x=>JSON.parse(JSON.stringify(x));
const exists=p=>fs.existsSync(path.join(__dirname,'static',p));
test('different independent module counts; real image files; missing audio explicit',()=>{
  for(const p of [picnic,tidy]){const result=validate(p,{exists});assert.deepEqual(result.errors,[]);assert(result.warnings.some(x=>x.includes('missing resource')));assert(validate(p,{exists,strict:true}).errors.length>0);}
  assert.equal(tidy.modules.story.length,2);assert.equal(tidy.modules.dialogue.length,2);assert.equal(tidy.words.length,3);assert.equal(picnic.modules.dialogue.length,4);
});
test('draft remains blocked even when all audio exists and metadata is reviewed',()=>{const p=copy(picnic);for(const a of p.assets)if(a.kind==='audio'){a.source='test source';a.rights='test permission';a.reviewed=true;}assert(validate(p,{strict:true}).errors.some(x=>x.includes('draft cannot be released')));});
test('release CLI fails closed while sample resources remain unfinished',()=>{const {spawnSync}=require('node:child_process');const result=spawnSync(process.execPath,[path.join(__dirname,'validate-content.cjs'),'--release'],{encoding:'utf8',windowsHide:true});assert.equal(result.status,1);assert(result.stderr.includes('missing resource'));assert(result.stderr.includes('draft cannot be released'));});
const mutations={
  'duplicate IDs':p=>p.words[1].id=p.words[0].id,
  'unknown word':p=>p.modules.story[0].mainWord='en.invalid.word',
  'empty module':p=>p.modules.dialogue=[],
  'unknown gameplay':p=>p.modules.game.type='eval-code',
  'unknown template':p=>p.modules.story[0].templateId='dynamic-html',
  'unsafe path':p=>p.assets[0].path='../data.sqlite3',
  'external path':p=>p.assets[0].path='https://example.org/x.svg',
  'invalid hotspot':p=>p.modules.story[0].hotspots[0].x=2,
  'long reply':p=>p.modules.dialogue[0].options[0].text='one two three four five six seven eight nine',
  'too many candidates':p=>p.modules.game.questions[0].options.push(p.words[0].id),
  'audio mismatch':p=>p.modules.story[0].segments[0].text='Another sentence.',
  'malformed content':p=>p.modules.dialogue[0].options=[null],
};
for(const [name,mutate]of Object.entries(mutations))test('reject '+name,()=>{const p=copy(picnic);mutate(p);assert(validate(p).errors.length>0);});
test('all 12 branches: selection/demo are not submissions; confirmation snapshot once',async()=>{
  for(const [index,round]of picnic.modules.dialogue.entries())for(const o of round.options){let calls=0;const s=new Session(picnic,{uuid:()=>o.id,save:async()=>calls++});s.index=index;s.select(o.id,{demo:true});assert.equal(calls,0);assert.equal(s.events.length,0);assert(await s.confirm());assert.equal(calls,1);assert.equal(s.events[0].selectedId,o.id);assert.equal(s.events[0].text,o.text);assert.equal(s.events[0].source,'demo');assert.equal(await s.confirm(),false);}
});
test('change selection after demonstration removes demo source',async()=>{
  const s=new Session(picnic);s.select(picnic.modules.dialogue[0].options[0].id,{demo:true});s.select(picnic.modules.dialogue[0].options[1].id);await s.confirm();assert.equal(s.events[0].source,'child');
});
test('save failure blocks new input, same ID retry after lost response deduplicates',async()=>{
  const stored=new Map();let fail=true,ids=[];const s=new Session(picnic,{uuid:()=> 'same-operation',save:async e=>{ids.push(e.operationId);stored.set(e.operationId,e);if(fail){fail=false;throw Error('response lost');}}});
  const id=picnic.modules.dialogue[0].options[0].id;s.select(id);assert.equal(await s.confirm(),false);assert(s.failed);assert.equal(s.select(picnic.modules.dialogue[0].options[1].id),false);assert.equal(s.next(),false);assert(await s.retry());assert.deepEqual(ids,['same-operation','same-operation']);assert.equal(stored.size,1);assert.equal(s.events.length,1);
});
test('duplicate clicks while saving and completion do not save twice',async()=>{
  let release,calls=0;const s=new Session(picnic,{save:()=>{calls++;return new Promise(r=>release=r);}});s.select(picnic.modules.dialogue[0].options[0].id);const pending=s.confirm();assert.equal(await s.confirm(),false);release();await pending;assert.equal(calls,1);
});
test('late save response after leaving cannot mutate the new module',async()=>{
  let release;const s=new Session(picnic,{save:()=>new Promise(r=>release=r)});s.select(picnic.modules.dialogue[0].options[0].id);const pending=s.confirm();s.enter('game');release();assert.equal(await pending,false);assert.equal(s.module,'game');assert.equal(s.done,false);assert.equal(s.events.length,0);
});
test('picnic requires completed listening, wrong attempt keeps order',async()=>{
  const s=new Session(picnic);s.enter('game');const q=picnic.modules.game.questions[0],original=[...q.options];s.select(q.options[1]);assert.equal(await s.confirm(),false);assert.equal(s.attempts,0);s.heard=true;assert(await s.confirm());assert.equal(s.done,false);assert.equal(s.attempts,1);assert.deepEqual(q.options,original);s.select(q.target);assert(await s.confirm());assert(s.done);
});
test('tidy requires explicit destination, allows changing object; no listening gate',async()=>{
  const s=new Session(tidy);s.enter('game');const q=tidy.modules.game.questions[0];s.select(q.options[1]);s.select(q.target);assert.equal(await s.confirm(),false);assert.equal(await s.confirm('unknown'),false);assert(await s.confirm('tidy.shelf'));assert.equal(s.done,false);assert(await s.confirm(q.zone));assert(s.done);assert.equal(s.attempts,2);
});
test('instructions and repeat never demonstrate or submit answers',()=>{const s=new Session(picnic);s.enter('game');assert(s.help('instructions'));assert(s.help('repeat'));assert.equal(s.selection,null);assert.equal(s.demoUsed,false);assert.equal(s.events.length,0);assert.equal(s.help('unknown'),false);});
test('game demonstration persists across wrong attempts and changing selections',async()=>{const s=new Session(picnic);s.enter('game');s.help('demo');assert.equal(s.events.length,0);s.heard=true;const q=picnic.modules.game.questions[0];s.select(q.options.find(id=>id!==q.target));await s.confirm();assert.equal(s.events[0].hinted,true);s.select(q.target);await s.confirm();assert.equal(s.events[1].hinted,true);assert.deepEqual(s.events[1].helpTypes,['demo']);s.next();assert.equal(s.demoUsed,false);assert.deepEqual(s.helpTypes,[]);});
test('candidate order is created once per question and included in saved snapshot',async()=>{const s=new Session(picnic,{random:()=>0});s.enter('game');const order=s.candidates();assert.notDeepEqual(order,picnic.modules.game.questions[0].options);s.heard=true;s.select(order.find(id=>id!==picnic.modules.game.questions[0].target));await s.confirm();assert.deepEqual(s.candidates(),order);assert.deepEqual(s.events[0].candidateOrder,order);const copy=s.candidates();copy.reverse();assert.deepEqual(s.candidates(),order);});
