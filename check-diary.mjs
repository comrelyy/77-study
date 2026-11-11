import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {routeOrder,levelStates} from './static/core/route.mjs';
import {mapLevels,renderDayMap} from './static/core/day-map.mjs';
import {diaryDays,pickDay,shouldTurn,renderDiary} from './static/core/diary.mjs';
import {Element,documentModel} from './tests/fake-dom.mjs';
const require=createRequire(import.meta.url),base=require('./static/content/catalog.json');
const END='Momo 的日记写到这里啦，新的一天还在写',GOODNIGHT='晚安，Momo。今天的路都走完啦！';
const two={...base,scenes:{...base.scenes,'zoo-gate':base.scenes.washing,'zoo-lion':base.scenes.dressing},previewScenes:[...base.previewScenes,'zoo-gate','zoo-lion'],
  days:[...base.days,{id:'zoo',title:'去动物园',approved:true,route:[{id:'zoo-gate',band:0,icon:'ticket'},{id:'zoo-lion',band:1,icon:'lion'}]}]};
function setup(catalog,cleared){
  const order=routeOrder(catalog),packs=Object.fromEntries(order.map(id=>[id,require('./static/'+(catalog.scenes[id]))]));
  const levels=mapLevels(order,catalog,packs);return {order,days:diaryDays(catalog,order,new Set(cleared),levels)};
}
function draw(catalog,cleared,opts={}){
  globalThis.document=documentModel();const root=new Element('main'),{order,days}=setup(catalog,cleared),entered=[];
  renderDiary(root,{days,enterScene:id=>entered.push(id),playAudio(){},reduceMotion:true,...opts});
  return {root,days,entered,tabs:()=>root.querySelectorAll('.diary-tab'),bubble:()=>root.querySelector('.map-bubble'),h1:()=>root.querySelector('h1').textContent};
}
const ALL=routeOrder(two);const EVERY=ALL.slice(0,13);
test('opens on the first day with an uncleared level',()=>{
  const {days,tabs,root}=draw(two,EVERY);
  assert.equal(pickDay(days,null),1);assert.deepEqual(tabs().map(t=>t.textContent),['第 1 天 ✓','第 2 天 · 去动物园']);
  assert.equal(root.querySelectorAll('.map-level').length,2);assert.equal(root.querySelectorAll('.map-level')[0].attributes['data-state'],'current');
});
test('only unlocked days get tabs; a later day shows the 下一天… placeholder',()=>{
  const {tabs}=draw(two,['washing']);
  assert.deepEqual(tabs().map(t=>t.textContent),['第 1 天 · 普通的一天','下一天…']);assert(tabs()[1].disabled);
});
test('no placeholder and diary-end text when every approved day is done',()=>{
  const {tabs,bubble}=draw(two,ALL);
  assert.deepEqual(tabs().map(t=>t.textContent),['第 1 天 ✓','第 2 天 ✓']);assert.equal(bubble().textContent,END);
});
test('earlier finished day keeps the goodnight line',async()=>{
  const {tabs,bubble,h1}=draw(two,ALL);await tabs()[0].fire();
  assert.equal(bubble().textContent,GOODNIGHT);assert.equal(h1(),'第 1 天 · 普通的一天');
});
test('turning the page: focus on next day first level after finishing the previous day',async()=>{
  const {days}=setup(two,EVERY);assert.equal(shouldTurn(days,'zoo-gate'),true);
  assert.equal(shouldTurn(days,'zoo-lion'),false);assert.equal(shouldTurn(days,'bedtime'),false);assert.equal(shouldTurn(setup(two,['washing']).days,'zoo-gate'),false);
  assert.equal(draw(two,EVERY,{focusId:'zoo-gate',reduceMotion:true}).h1(),'第 2 天 · 去动物园');
  const d=draw(two,EVERY,{focusId:'zoo-gate',reduceMotion:false,turnDelay:10});
  assert.equal(d.h1(),'第 1 天 · 普通的一天');assert.equal(d.bubble().textContent,GOODNIGHT);
  await new Promise(r=>setTimeout(r,40));
  assert.equal(d.h1(),'第 2 天 · 去动物园');assert(d.root.querySelector('.diary-page').className.includes('diary-turn'));
});
test('single approved day renders exactly like before',()=>{
  const {root,h1,tabs}=draw(base,[]);
  assert.equal(tabs().length,0);assert.equal(root.querySelectorAll('button').filter(b=>!b.className.includes('map-')).length,0);
  assert.equal(root.querySelectorAll('.map-level').length,13);assert.equal(h1(),'第 1 天 · 普通的一天');
});
test('a playable level in no day is the last station of the last page, and the diary does not end before it',()=>{
  const extra={...two,scenes:{...two.scenes,extra:base.scenes.picnic},previewScenes:[...two.previewScenes,'extra']};
  const {days,root,bubble}=draw(extra,ALL);
  assert.deepEqual(days.at(-1).levels.map(l=>l.id),['zoo-gate','zoo-lion','extra']);assert.equal(days.at(-1).done,false);
  const stops=root.querySelectorAll('.map-level');assert.equal(stops.length,3);assert.equal(stops[2].attributes['data-state'],'current');
  assert.notEqual(bubble()?.textContent,END);
});
test('clicking a day tab during the page-turn delay cancels the turn',async()=>{
  const d=draw(two,EVERY,{focusId:'zoo-gate',reduceMotion:false,turnDelay:10});
  await d.tabs()[0].fire();await new Promise(r=>setTimeout(r,40));
  assert.equal(d.h1(),'第 1 天 · 普通的一天');
});
