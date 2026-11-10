import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {routeLinks,lessonLink}=require('./route-build.cjs'),bridges=require('./route-bridges.cjs');
const {finalizeLesson,stripLesson}=require('./lesson-build.cjs'),{validate}=require('./static/core/model.js');
const catalog=require('./static/content/catalog.json');
const packsById=Object.fromEntries(catalog.route.map(r=>[r.id,require('./static/content/'+r.id+'.json')]));
const links=routeLinks(catalog,packsById);
const texts=(id)=>links[id].review.map(r=>packsById[r.sceneId].words.find(w=>w.id===r.wordId).text);
const clone=x=>JSON.parse(JSON.stringify(x));

test('review words follow the nearest-first rule',()=>{
  assert.deepEqual(links.washing.review,[]);
  assert.deepEqual(texts('dressing'),['toothbrush','towel','soap']);
  assert.deepEqual(texts('park'),['seat','bag','ticket']);
  for(const w of ['hat','cup','ball','teddy'])assert(!texts('birthday').includes(w),w);
  for(const {id} of catalog.route){
    const own=packsById[id].words.map(w=>w.text);
    assert(links[id].review.length<=3);
    assert(!texts(id).some(t=>own.includes(t)),id);
  }
});
test('every level has its bridge text',()=>{
  assert.deepEqual(Object.keys(links),catalog.route.map(r=>r.id));
  for(const id of Object.keys(links))assert.deepEqual(links[id].bridge,bridges[id],id);
  assert.equal(lessonLink(catalog,packsById,'nope'),null);
});
test('lessonLink carries the source packs of the review words',()=>{
  const l=lessonLink(catalog,packsById,'park');
  for(const r of l.review)assert(l.packs[r.sceneId]);
});
test('link adds bridge and review to the lesson layer only',()=>{
  const park=packsById.park,base=stripLesson(park);
  const {pack}=finalizeLesson(base,require('./content-lesson/park.json'),null,lessonLink(catalog,packsById,'park'));
  const words=pack.lesson.steps[0];
  assert.equal(words.review.length,3);
  assert(words.review.every(r=>r.id.includes('.lesson.review.')&&pack.assets.some(a=>a.id===r.image)&&pack.assets.some(a=>a.id===r.audio)));
  assert.equal(pack.lesson.bridge.text,bridges.park.text);
  const a=pack.assets.find(x=>x.id===pack.lesson.bridge.audio);
  assert(/^audio\/park\/lesson\/bridge-[0-9a-f]{8}\.wav$/.test(a.path));
  assert.deepEqual(stripLesson(pack).words,base.words);
  assert.deepEqual(validate(pack,{exists:p=>p.includes('/lesson/')||require('fs').existsSync('static/'+p)}).errors,[]);
});
test('overlay stays valid after links',()=>{
  const ov=require('./content-lesson/park.json'),base=stripLesson(packsById.park);
  const {pack,warnings}=finalizeLesson(base,ov,null,lessonLink(catalog,packsById,'park'));
  assert.equal(pack.lesson.baseVersion,base.contentVersion);
  assert.equal(ov.sourceVersion,pack.lesson.baseVersion);
  assert(!warnings.some(w=>w.includes('题目基于旧内容')));
  assert.equal(require('./static/content/park.json').lesson.baseVersion,ov.sourceVersion);
});
test('rebuild is stable',()=>{
  const ov=require('./content-lesson/park.json'),link=lessonLink(catalog,packsById,'park');
  const first=finalizeLesson(packsById.park,ov,packsById.park,link).pack;
  const again=finalizeLesson(first,ov,first,link).pack;
  assert.deepEqual(again,first);
  const ids=again.assets.map(a=>a.id);assert.equal(new Set(ids).size,ids.length);
});
test('first level has a bridge but no review',()=>{
  const {pack}=finalizeLesson(stripLesson(packsById.washing),null,null,lessonLink(catalog,packsById,'washing'));
  assert(pack.lesson.bridge);assert.equal(pack.lesson.steps[0].review,undefined);
});
test('link=null output unchanged',()=>{
  const a=finalizeLesson(stripLesson(packsById.park),null,null).pack,b=finalizeLesson(stripLesson(packsById.park),null,null,null).pack;
  assert.deepEqual(a,b);assert.equal(a.lesson.bridge,undefined);
});
