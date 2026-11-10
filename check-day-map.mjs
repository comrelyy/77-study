import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {routeOrder,levelStates} from './static/core/route.mjs';
import {renderDayMap,clearedFrom,mapLevels} from './static/core/day-map.mjs';
import {Element,documentModel} from './tests/fake-dom.mjs';
const require=createRequire(import.meta.url),catalog=require('./static/content/catalog.json');
const order=routeOrder(catalog),packs=Object.fromEntries(order.map(id=>[id,require('./static/'+catalog.scenes[id])]));
const levels=mapLevels(order,catalog,packs);
function draw(cleared,opts={}){
  globalThis.document=documentModel();const root=new Element('main'),entered=[],played=[];
  renderDayMap(root,{levels,states:levelStates(order,new Set(cleared)),enterScene:id=>entered.push(id),playAudio:path=>played.push(path),...opts});
  return {root,entered,played,card:()=>root.querySelector('.map-card'),go:()=>root.querySelector('.map-card').querySelector('.map-go')};
}
test('one real button per level with route states',()=>{
  const {root}=draw(['washing']),buttons=root.querySelectorAll('.map-level');
  assert.equal(buttons.length,13);assert(buttons.every(b=>b.tagName==='button'));
  assert.deepEqual(buttons.map(b=>b.attributes['data-state']),['done','current',...Array(11).fill('locked')]);
  assert.equal(levels[1].title,'准备出门');assert.equal(levels[1].review.length,3);assert.equal(levels[0].review.length,0);
});
test('card shows station, band, state, title, review words, own words and action',async()=>{
  const {root,card,go,entered}=draw(['washing']);
  assert(card().textContent.includes('第 2 站'));assert(card().textContent.includes('清晨'));assert(card().textContent.includes('准备出门'));
  assert(card().textContent.includes('toothbrush'));assert(card().textContent.includes('shirt'));
  assert.equal(go().textContent,'出发');await go().fire();assert.deepEqual(entered,['dressing']);
  await root.querySelectorAll('.map-level')[2].fire();assert.equal(go().textContent,'还没解锁');assert(go().disabled);
  await go().fire();assert.deepEqual(entered,['dressing']);
  await root.querySelectorAll('.map-level')[0].fire();assert.equal(go().textContent,'再玩一次');await go().fire();assert.deepEqual(entered,['dressing','washing']);
  await root.querySelectorAll('.map-level')[1].fire();await go().fire();assert.deepEqual(entered,['dressing','washing','dressing']);
});
test('own words learned earlier are marked seen',()=>{
  const seenLevel=levels.find(l=>l.words.some(w=>w.seen));
  assert.equal(seenLevel.id,'picnic');
  const {root,card}=draw(order.slice(0,order.indexOf(seenLevel.id)),{focusId:seenLevel.id});
  assert(card().textContent.includes('见过'));assert(root.querySelectorAll('.map-word').some(w=>w.className.includes('seen')));
});
test('recommended level bubble shows the bridge and never autoplays',async()=>{
  const {root,played}=draw(['washing']),bubble=root.querySelector('.map-bubble');
  assert(bubble.textContent.includes(levels[1].bridge.text));assert(bubble.textContent.includes(levels[1].bridge.cn));
  assert.deepEqual(played,[]);
  await bubble.querySelector('.map-speak').fire();assert.deepEqual(played,[levels[1].bridge.audio]);
  assert.match(levels[1].bridge.audio,/^audio\//);
});
test('all cleared: no current level and Momo says good night',()=>{
  const {root}=draw(order);
  assert(!root.querySelectorAll('.map-level').some(b=>b.attributes['data-state']==='current'));
  assert.equal(root.querySelector('.map-bubble').textContent,'晚安，Momo。今天的路都走完啦！');
});
test('focus selects a level; unknown focus falls back to the recommended level',()=>{
  assert(draw(['washing','dressing'],{focusId:'washing'}).card().textContent.includes('洗漱啦'));
  assert(draw(['washing'],{focusId:'nope'}).card().textContent.includes('准备出门'));
});
test('pending cleared ops count as cleared',()=>{
  const cleared=clearedFrom({events:[{kind:'cleared',payload:{sceneId:'dressing'}},{kind:'introduced',payload:{sceneId:'park'}}]},[{kind:'cleared',payload:{sceneId:'washing'}},{kind:'checkpoint',payload:{sceneId:'breakfast'}}]);
  assert.deepEqual([...cleared].sort(),['dressing','washing']);
  assert(clearedFrom({events:[]},[{kind:'cleared',payload:{sceneId:'washing'}}]).has('washing'));
  assert.equal(clearedFrom(null,[]).size,0);
});
test('locked scene url renders map with notice',()=>{
  const {root}=draw(['washing'],{notice:'先走完前面的路才能来'});
  assert.equal(root.querySelector('.map-notice').textContent,'先走完前面的路才能来');
  assert.equal(root.querySelectorAll('.map-level').length,13);
  assert(!draw(['washing']).root.querySelector('.map-notice'));
});
function drawNarrow(cleared,opts={},width=358){
  const doc=documentModel(),scrolls=[];globalThis.document={createElement:tag=>{const e=doc.createElement(tag);e.clientWidth=width;e.style.setProperty=()=>{};e.scrollIntoView=o=>scrolls.push([e,o]);return e;}};
  const root=new Element('main');renderDayMap(root,{levels,states:levelStates(order,new Set(cleared)),enterScene:()=>{},playAudio:()=>{},...opts});
  return {root,scrolls};
}
test('narrow: selected level is scrolled into view once, centred',()=>{
  const {root,scrolls}=drawNarrow(order.slice(0,8));
  assert(root.querySelector('.map-sheet').className.includes('narrow'));
  assert.equal(scrolls.length,1);assert.equal(scrolls[0][0],root.querySelectorAll('.map-level')[8]);
  assert.equal(scrolls[0][1].block,'center');
  assert.equal(drawNarrow(order.slice(0,8),{reduceMotion:true}).scrolls[0][1].behavior,'instant');
});
test('narrow: tapping a level reveals the card action; desktop does not scroll',async()=>{
  const {root,scrolls}=drawNarrow(['washing']);scrolls.length=0;
  await root.querySelectorAll('.map-level')[0].fire();
  assert.equal(scrolls.length,1);assert.equal(scrolls[0][0],root.querySelector('.map-card'));
  const desk=drawNarrow(['washing'],{},900);assert(!desk.root.querySelector('.map-sheet').className.includes('narrow'));
  await desk.root.querySelectorAll('.map-level')[0].fire();assert.equal(desk.scrolls.length,0);
});
test('a pack that failed to load is a disabled unavailable stop and later stops stay locked',async()=>{
  const partial={...packs};delete partial.washing;const lv=mapLevels(order,catalog,partial);
  assert.equal(lv.length,13);assert.equal(lv[0].unavailable,true);assert.equal(lv[0].title,'washing');
  const {root,card,go}=draw([],{levels:lv});
  assert.deepEqual(root.querySelectorAll('.map-level').map(b=>b.attributes['data-state']).slice(0,3),['current','locked','locked']);
  assert(card().textContent.includes('这一站暂时打不开'));assert(go().disabled);
  await go().fire();
  await root.querySelectorAll('.map-level')[1].fire();assert.equal(go().textContent,'还没解锁');assert(go().disabled);
});
