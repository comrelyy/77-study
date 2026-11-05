const {test}=require('node:test'),assert=require('node:assert/strict');
const {matrix,inspectEvidence,generate}=require('./s5-release.cjs');
const evidence=()=>({fingerprint:'current',capturedAt:new Date().toISOString(),environment:{chromeStable:true,zoom100:true,mouse:true,userAgent:'Chrome/156.0.0.0',viewport:{width:1440,height:900}},results:Object.fromEntries(matrix.map(i=>[i.id,{status:'passed',note:'Actual observation'}]))});
test('S5 requires explicit current-version observations for every matrix item',()=>{assert(inspectEvidence(null,'current').length);const e=evidence();assert.equal(inspectEvidence(e,'current').length,0);e.results.audio.status='pending';assert(inspectEvidence(e,'current').length);e.results.audio.status='passed';e.results.audio.note='';assert(inspectEvidence(e,'current').length);assert(inspectEvidence(e,'old-version').length);});
test('S5 rejects stale evidence and incorrect Chrome environment',()=>{const e=evidence();e.capturedAt='2020-01-01';assert(inspectEvidence(e,'current').length);e.capturedAt=new Date().toISOString();e.environment.userAgent='Chrome/156 Edg/156';assert(inspectEvidence(e,'current').length);e.environment.userAgent='Chrome/156';e.environment.viewport.width=600;assert(inspectEvidence(e,'current').length);});
test('development scene catalog cannot silently pass release gate',()=>{const r=generate();assert.equal(r.status,'blocked');assert(r.blockers.length);assert(r.scenes.length>=2);assert.equal(r.familyTrial,'pending-voluntary-observation');assert.equal(r.fingerprint.length,64);});
const {inspectScenes}=require('./release-scenes.cjs');
test('release checks only explicitly published scenes, keeping internal examples diagnostic',()=>{
  const scenes=[{id:'picnic',status:'released',missingAssets:[]},{id:'tidy',status:'draft',missingAssets:['audio/internal.wav']}];
  assert.deepEqual(inspectScenes({releasedScenes:['picnic']},scenes),[]);
  assert(inspectScenes({releasedScenes:[]},scenes).length);
  assert(inspectScenes({releasedScenes:['missing']},scenes).length);
  assert(inspectScenes({releasedScenes:['picnic','picnic']},scenes).length);
  assert(inspectScenes({releasedScenes:['tidy']},scenes).some(x=>x.includes('批准')));
  assert(inspectScenes({releasedScenes:['tidy']},scenes).some(x=>x.includes('本地资源')));
});
test('empty development release list retains preview audio blockers without promoting internal drafts',()=>{
  const blockers=inspectScenes({mode:'development',previewScene:'picnic',releasedScenes:[]},[{id:'picnic',status:'draft',missingAssets:['audio/a.wav']},{id:'tidy',status:'draft',missingAssets:['audio/b.wav']}]);
  assert(blockers.some(x=>x.includes('清单为空')));assert(blockers.some(x=>x.includes('picnic 缺少')));assert(!blockers.some(x=>x.includes('tidy')));
});

test('a partial release cannot satisfy an explicitly declared complete launch',()=>{
  const scenes=[{id:'picnic',status:'released',missingAssets:[]},{id:'park',status:'released',missingAssets:[]}];
  const catalog={releasedScenes:['picnic'],requiredReleaseScenes:['picnic','park']};
  assert(inspectScenes(catalog,scenes).some(x=>x.includes('首发主题尚未就绪：park')));
  assert.deepEqual(inspectScenes({...catalog,releasedScenes:['picnic','park']},scenes),[]);
});
