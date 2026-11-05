const {test}=require('node:test'),assert=require('node:assert/strict');
const {fields,validate}=require('./static/dev/review-core.js');
const sourceHashes={'source.js':'a'.repeat(64)},sampleHashes=Object.fromEntries(Array.from({length:10},(_,i)=>['audio.'+i,String(i).repeat(64)]));
function record(){return {stage:'S1',schemaVersion:1,reviewer:'test reviewer',reviewedAt:new Date().toISOString(),contentVersion:'0.1.0',checks:Object.fromEntries(fields.map(x=>[x,true])),sourceRightsEvidence:'test-only evidence',sourceHashes:{...sourceHashes},sampleHashes:{...sampleHashes},listenedIds:Object.keys(sampleHashes)};}
const inspect=r=>validate(r,{sourceHashes,sampleHashes});
test('review can match a specific source and sample set',()=>assert.deepEqual(inspect(record()),[]));
test('changing any reviewed source invalidates the review',()=>{const r=record();r.sourceHashes['source.js']='b'.repeat(64);assert(inspect(r).some(x=>x.includes('源文件')));});
test('replacing a sound invalidates prior listening approval',()=>{const r=record();r.sampleHashes['audio.1']='b'.repeat(64);assert(inspect(r).some(x=>x.includes('样音变化')));});
test('manual listened checkbox is insufficient without all ten played IDs',()=>{const r=record();r.listenedIds.pop();assert(inspect(r).some(x=>x.includes('完整试听')));});
test('missing sample set cannot produce a passing review',()=>assert(validate(record(),{sourceHashes,sampleHashes:{}}).length>0));
test('unchecked reviews, missing attribution, absent or stale reviewer block completion',()=>{
  for(const key of fields){const r=record();r.checks[key]=false;assert(inspect(r).length>0);}
  for(const modify of [r=>r.reviewer='',r=>r.sourceRightsEvidence='',r=>r.reviewedAt='2000-01-01']){const r=record();modify(r);assert(inspect(r).length>0);}
});
