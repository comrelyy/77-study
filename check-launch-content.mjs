import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {App} from './static/core/app.mjs';
import {MemoryStore} from './static/core/store.mjs';
import {serializeProgress,restoreProgress} from './static/core/progress.mjs';
import {availableScenes} from './static/core/catalog.mjs';
import {StoryState} from './static/core/story-state.mjs';
import {documentModel,Element} from './tests/fake-dom.mjs';
const require=createRequire(import.meta.url),catalog=require('./static/content/catalog.json');
const {validate,Session}=require('./static/core/model.js');
const packs=availableScenes(catalog).map(id=>require('./static/'+catalog.scenes[id]));

test('audio provenance rejects a changed transcript, hash or unknown synthesis voice',()=>{
  const {auditPack}=require('./content-audit.cjs');
  const p=packs.find(p=>p.sceneId==='dressing');
  const manifest=require('./static/audio/s4-dressing-manifest.json');
  assert.equal(auditPack(p,manifest).technicalStatus,'passed');
  for(const [field,value]of [['text','different words'],['sha256','0'.repeat(64)],['voice','unknown']]){
    const changed=structuredClone(manifest);changed.entries[0][field]=value;
    const result=auditPack(p,changed);assert.equal(result.technicalStatus,'failed');assert(result.errors.some(e=>e.includes('provenance')));
  }
});

test('all twelve narrative themes have complete local content; none is silently released',()=>{
  assert.equal(packs.length,12);assert.deepEqual(catalog.releasedScenes,[]);
  const vocabulary=new Map();
  for(const p of packs){
    assert.equal(p.status,'draft');assert(p.learning.goal);assert(p.learning.function);
    assert.deepEqual(validate(p,{exists:file=>fs.existsSync('static/'+file)}).errors,[]);
    assert(p.assets.every(a=>fs.existsSync('static/'+a.path)),p.sceneId+' missing local asset');
    const sounds=require('./audio-validation.cjs').inspectPack(p,'static');assert(sounds.every(a=>a.valid),p.sceneId+' invalid audio');
    assert(validate(p,{strict:true}).errors.length>0,'draft must not pass release');
    for(const w of p.words){if(vocabulary.has(w.id))assert.equal(vocabulary.get(w.id),w.text);vocabulary.set(w.id,w.text);}
    const openings=p.modules.story.map(s=>s.segments[0].text);assert.equal(new Set(openings).size,openings.length,'repeated story opening');
    assert(p.modules.story.length>=6);assert(p.modules.story.every(s=>s.segments.length>=3&&new Set(s.segments.map(s=>s.speaker)).size>=3),'each scene needs narration and an exchange');
    for(const s of p.modules.story){assert(s.illustration);assert(p.assets.find(a=>a.id===s.illustration).path.includes('/scenes/'));}
    for(const a of p.assets.filter(a=>a.kind==='audio'))assert.equal(a.reviewed,false,'generated files do not count as human review');
  }
  assert(vocabulary.size>=25);assert(packs.reduce((n,p)=>n+p.words.length,0)>vocabulary.size,'words should recur across themes');
  const tidy=packs.find(p=>p.sceneId==='tidy');assert.equal(tidy.assets.find(a=>a.id==='tidy.teddy.image').path,'illustrations/teddy.svg');
});

test('every theme renders every step, preserves progress, and records real choices',async()=>{
  for(const pack of packs){
    globalThis.document=documentModel();const root=new Element('main'),store=new MemoryStore();let counter=0;
    const app=new App({root,pack,store,Session,uuid:()=>pack.sceneId+'-'+(++counter),player:{stop(){},async play(){return true;}}});
    await app.init();assert(root.textContent.includes(pack.title));
    for(const module of ['story','dialogue','game','summary']){
      app.open(module);const state=app.stateFor(module);
      if(module==='story'){
        for(let i=0;i<pack.modules.story.length;i++){state.step=i;state.fragment=0;app.draw();assert(root.textContent.includes(pack.modules.story[i].title));assert(root.querySelector('.story-landscape'));}
      }else if(module==='game'){
        for(let i=0;i<pack.modules.game.questions.length;i++){
          state.index=i;state.done=false;state.selection=null;app.draw();const q=pack.modules.game.questions[i];
          if(['listen-pack','scene-find'].includes(pack.modules.game.type)){state.heard=true;assert(!root.textContent.includes('这次请安放：'));}
          else if(pack.modules.game.type==='select-place')assert(root.textContent.includes(app.word(q.target).cn));
          if(q.solution){state.sequence=[];for(const word of q.solution)state.select(word);}else state.select(q.target);
          assert(await state.confirm(q.zone));assert.equal(state.pending,null);assert(state.done);
        }
      }else if(module==='dialogue'){
        for(let i=0;i<pack.modules.dialogue.length;i++){state.index=i;state.done=false;state.selection=null;app.draw();const r=pack.modules.dialogue[i];assert(root.textContent.includes(r.question[0].text));state.select(r.options[0].id);assert(await state.confirm());}
      }
      const saved=serializeProgress(pack,module,state);
      const target=module==='summary'?{}:module==='story'?new StoryState(pack.modules.story):new Session(pack);
      if(module==='dialogue'||module==='game')target.enter(module);
      assert(restoreProgress(pack,module,target,{...saved,compatible:true}));
      assert.deepEqual(serializeProgress(pack,module,target),saved,'restoring into a fresh state must preserve the last saved step');
    }
    const events=(await store.state()).events;
    assert(events.some(e=>e.payload.sceneId===pack.sceneId&&e.payload.mode==='dialogue_reply'));
    assert(events.some(e=>e.payload.sceneId===pack.sceneId&&['packing_game','tidy_game','scene_find_game','story_order_game'].includes(e.payload.mode)));
  }
});
