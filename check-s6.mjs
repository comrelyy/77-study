import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {reviewWords} from './static/core/enhancements.mjs';
const require=createRequire(import.meta.url);
const {Player}=require('./static/core/player.js');
const pack={sceneId:'a',contentVersion:'2',compatibleFrom:['1'],words:['apple','pear','milk'].map(id=>({id,audio:id+'-audio',image:id+'-image'})),assets:['apple','pear','milk'].flatMap(id=>[{id:id+'-audio',path:id+'.wav'},{id:id+'-image',path:id+'.svg'}])};
const event=(id,sceneId='a',version='2')=>({kind:'introduced',payload:{wordId:id,sceneId,contentVersion:version}});
test('review deduplicates globally, uses newest valid source, limits to two',()=>{
  const other={...pack,sceneId:'b'};
  const selected=reviewWords([event('milk'),event('pear'),event('apple'),event('apple','b')],[pack,other]);
  assert.deepEqual(selected.map(x=>[x.word.id,x.pack.sceneId]),[['apple','b'],['pear','a']]);
});
test('invalid versions and missing resources fall back to older valid sources',()=>{
  const other={...pack,sceneId:'b',assets:[]};
  assert.equal(reviewWords([event('apple'),event('apple','b'),event('apple','a','obsolete')],[pack,other])[0].pack.sceneId,'a');
  assert.deepEqual(reviewWords([event('apple')],[pack],p=>!p.endsWith('.wav')),[]);
  assert.deepEqual(reviewWords([{kind:'choice',payload:{wordId:'apple'}}],[pack]),[]);
});
test('rate change cancels pending playback; new sound waits for ended',async()=>{
  const sounds=[];const player=new Player({audio:()=>{const a={play:()=>Promise.resolve(),pause(){}};sounds.push(a);return a;}});
  const first=player.play('one');player.setRate(.8);assert.equal(await first,false);
  const second=player.play('two');assert.equal(sounds[1].playbackRate,.8);assert.equal(sounds[1].preservesPitch,true);
  sounds[0].onended();sounds[1].onended();assert.equal(await second,true);
  assert.throws(()=>player.setRate(4));
});
test('fallback receives chosen speed and is cancelled by rate change',async()=>{
  let speed,cancelled=false;const p=new Player({fallback:(text,done,rate)=>{speed=rate;return ()=>{cancelled=true;};}});
  p.setRate(.8);const pending=p.play(null,'apple',{allowFallback:true});assert.equal(speed,.8);p.setRate(1);assert.equal(await pending,false);assert.equal(cancelled,true);
});
