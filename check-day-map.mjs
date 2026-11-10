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
