import test from 'node:test';
import assert from 'node:assert/strict';
import {loadReviewSources,reviewCandidates,hearReview} from './static/core/review-sources.mjs';
import {documentModel} from './tests/fake-dom.mjs';
import {renderSummary} from './static/modules/summary.mjs';
const make=id=>({sceneId:id,title:'情景 '+id,contentVersion:'1',words:[{id:'apple',text:'apple',cn:'苹果',audio:'sound',image:'picture'}],assets:[{id:'sound',path:'audio/'+id+'.wav'},{id:'picture',path:'illustrations/'+id+'.svg'}],modules:{summary:['apple']}});
const current=make('a'),other=make('b');
const event=id=>({kind:'introduced',payload:{sceneId:id,wordId:'apple',contentVersion:'1'}});
const catalog={mode:'release',releasedScenes:['a','b'],developmentScenes:['tidy'],scenes:{a:'content/a.json',b:'content/b.json',tidy:'content/tidy.json'}};
function setup(overrides={}){const calls=[];return {calls,args:{catalog,current,events:[event('b')],validate:()=>({errors:[]}),fetcher:async(path)=>{calls.push(path);return {ok:true,json:async()=>other};},...overrides}};}
test('loads allowed historical source and verifies its local resources',async()=>{
  const {args,calls}=setup(),result=await loadReviewSources(args);
  assert.equal(result.packs[1],other);assert.ok(calls.includes('audio/b.wav'));
  assert.equal(reviewCandidates({data:{events:args.events},pack:current,reviewPacks:result.packs,availableReviewAssets:result.available})[0].pack,other);
});
test('draft examples and internal pages cannot import family sources',async()=>{
  const {args,calls}=setup({events:[event('tidy')]});await loadReviewSources(args);assert.ok(!calls.includes('content/tidy.json'));
  const isolated=setup({internal:true});await loadReviewSources(isolated.args);assert.ok(!isolated.calls.includes('content/b.json'));
});
test('invalid paths, mismatched IDs and rejected packs are omitted',async()=>{
  for(const override of [{catalog:{...catalog,scenes:{b:'../b.json'}}},{fetcher:async()=>({ok:true,json:async()=>current})},{validate:()=>({errors:['bad content']})}]){
    assert.equal((await loadReviewSources(setup(override).args)).packs.length,1);
  }
});
test('network failures and missing audio do not prevent the activity or yield a candidate',async()=>{
  const {args}=setup({fetcher:async path=>{if(path.startsWith('content/'))return {ok:true,json:async()=>other};throw Error('offline');}});
  const r=await loadReviewSources(args);assert.deepEqual(reviewCandidates({data:{events:args.events},pack:current,reviewPacks:r.packs,availableReviewAssets:r.available}),[]);
});
function app(){return {pack:current,reviewPacks:[current,other],availableReviewAssets:new Set(other.assets.map(a=>a.path)),data:{events:[event('b')]},store:{},allowed:()=>true,view:'module',moduleId:'summary',generation:1,pause(){},message(){},player:{play:async()=>true}};}
test('review plays source audio locally without writing participation; stale completion is ignored',async()=>{
  const a=app(),candidate=reviewCandidates(a)[0];let call;
  a.player.play=async(...args)=>{call=args;return true;};
  assert.equal(await hearReview(a,candidate),true);assert.equal(call[0],'audio/b.wav');assert.deepEqual(call[2],{allowFallback:false});
  a.player.play=async()=>{a.generation++;return true;};assert.equal(await hearReview(a,candidate),false);
  a.view='home';assert.equal(await hearReview(a,candidate),false);
});
test('summary uses source image, readable text, and skip creates no work',async()=>{
  globalThis.document=documentModel();const a=app(),body=document.createElement('section'),state={};let redraws=0;
  renderSummary({app:a,pack:current,body,messageNode:document.createElement('p'),word:()=>current.words[0],assetImage:()=>document.createElement('img'),hearWord(){},redraw(){redraws++;}},state);
  assert.ok(body.textContent.includes('再听听老朋友'));assert.ok(body.textContent.includes('来自：情景 b'));
  assert.ok(body.querySelectorAll('img').some(x=>x.src==='illustrations/b.svg'));
  await body.querySelectorAll('button').find(x=>x.textContent==='这次先跳过').fire();assert.equal(state.reviewSkipped,true);assert.equal(redraws,1);
});
