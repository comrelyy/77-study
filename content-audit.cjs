// Inventory and technical provenance checks. This never approves educational quality,
// listening, licensing or a release; those require explicit review evidence.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validate}=require('./static/core/model.js');
const {inspectPack}=require('./audio-validation.cjs');
const root=__dirname;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function auditPack(pack,manifest,{staticRoot=path.join(root,'static')}={}){
  const validation=validate(pack,{exists:file=>fs.existsSync(path.join(staticRoot,file))});
  // Lesson audio of an unreviewed lesson is synthesized later (Windows); until then it is pending, not an error.
  const pendingLesson=a=>pack.lesson?.reviewed===false&&a.id.includes('.lesson.');
  const pendingIds=new Set(pack.assets.filter(a=>a.kind==='audio'&&pendingLesson(a)&&!fs.existsSync(path.join(staticRoot,a.path))).map(a=>a.id));
  const errors=[...validation.errors],audio=inspectPack(pack,staticRoot).filter(a=>!pendingIds.has(a.id));
  const entries=manifest?.entries||[];
  for(const sound of audio){
    if(!sound.valid)errors.push(sound.id+': '+sound.error);
    const source=entries.find(e=>e.id===sound.id&&e.path===sound.path);
    sound.provenanceMatches=Boolean(source&&source.text===sound.text&&source.sha256===sound.sha256&&source.voice&&source.voice!=='unknown');
    if(!sound.provenanceMatches)errors.push(sound.id+': generated transcript/hash/voice provenance does not match');
    sound.voice=source?.voice||'unknown';
  }
  const text=pack.modules.story.flatMap(s=>s.segments.map(s=>s.text)).join(' ').toLowerCase();
  const uncovered=pack.words.filter(w=>!new RegExp('\\b'+w.text+'\\b','i').test(text)).map(w=>w.text);
  if(uncovered.length)errors.push('target words missing from story: '+uncovered.join(', '));
  const openings=pack.modules.story.map(s=>s.segments[0].text);
  if(new Set(openings).size!==openings.length)errors.push('repeated story openings');
  const pending=pack.assets.filter(a=>a.kind==='audio'&&(!a.source||!a.rights||a.reviewed!==true));
  return {id:pack.sceneId,title:pack.title,contentVersion:pack.contentVersion,status:pack.status,
    goal:pack.learning?.goal,languageFunction:pack.learning?.function,revisit:pack.learning?.revisit||[],
    words:pack.words.map(w=>({id:w.id,text:w.text,cn:w.cn})),storyScenes:pack.modules.story.length,
    dialogueRounds:pack.modules.dialogue.length,replyChoices:pack.modules.dialogue.reduce((n,r)=>n+r.options.length,0),
    gameplay:pack.modules.game.type,gameQuestions:pack.modules.game.questions.length,
    localAudio:audio.length,validAudio:audio.filter(a=>a.valid).length,provenanceMatched:audio.filter(a=>a.provenanceMatches).length,
    audioSeconds:Math.round(audio.reduce((n,a)=>n+(a.seconds||0),0)),pendingAudioReview:pending.length,pendingLessonAudio:pendingIds.size,
    technicalStatus:errors.length?'failed':'passed',releaseReadiness:'not-approved',errors,audio};
}
function generate(){
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'static/content/catalog.json'),'utf8'));
  const ids=[...new Set([...(catalog.previewScenes||[]),...catalog.releasedScenes])];
  const scenes=ids.map(id=>{
    const p=JSON.parse(fs.readFileSync(path.join(root,'static',catalog.scenes[id]),'utf8'));
    const file=path.join(root,'static/audio',id==='picnic'?'s4-manifest.json':'s4-'+id+'-manifest.json');
    const manifest=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
    return auditPack(p,manifest);
  });
  const occurrences=new Map();
  for(const s of scenes)for(const w of s.words){const item=occurrences.get(w.id)||{...w,scenes:[]};item.scenes.push(s.id);occurrences.set(w.id,item);}
  const sums=keys=>Object.fromEntries(keys.map(k=>[k,scenes.reduce((n,s)=>n+s[k],0)]));
  const report={generatedAt:new Date().toISOString(),technicalStatus:scenes.every(s=>s.technicalStatus==='passed')?'passed':'failed',
    productStatus:'content-drafts-awaiting-review',browserAcceptance:'not_run',listening:'pending',rights:'pending',
    totals:{themes:scenes.length,uniqueTargetWords:occurrences.size,...sums(['storyScenes','dialogueRounds','replyChoices','gameQuestions','localAudio','validAudio','provenanceMatched','audioSeconds','pendingAudioReview'])},
    repeatedVocabulary:[...occurrences.values()].filter(w=>w.scenes.length>1),
    scenes,sourceHashes:Object.fromEntries(['launch-content.cjs','content-v2.cjs','extra-themes.cjs','build-content.cjs','draw-content-assets.cjs',...ids.map(id=>'static/'+catalog.scenes[id])].map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]))};
  fs.mkdirSync(path.join(root,'reports'),{recursive:true});
  fs.writeFileSync(path.join(root,'reports/content-audit.json'),JSON.stringify(report,null,2)+'\n');
  return report;
}
if(require.main===module){const report=generate();console.log(JSON.stringify({technicalStatus:report.technicalStatus,totals:report.totals},null,2));for(const s of report.scenes)for(const e of s.errors)console.error(s.id+': '+e);process.exitCode=report.technicalStatus==='passed'?0:1;}
module.exports={auditPack,generate};
