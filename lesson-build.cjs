const fs=require('fs'),path=require('path'),crypto=require('crypto');
const clone=x=>JSON.parse(JSON.stringify(x));
const canon=x=>Array.isArray(x)?x.map(canon):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canon(x[k])])):x;
const same=(a,b)=>JSON.stringify(canon(a))===JSON.stringify(canon(b));
const semver=v=>String(v).split('.').map(Number);
const cmp=(a,b)=>{const x=semver(a),y=semver(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;return 0;};
const sha8=t=>crypto.createHash('sha1').update(t).digest('hex').slice(0,8);
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const {lessonLink}=require('./route-build.cjs');
const OLD='题目基于旧内容，需重新生成';

function stripLesson(pack){
  const out=clone(pack),lesson=out.lesson;delete out.lesson;
  out.assets=(out.assets||[]).filter(a=>!String(a.id).includes('.lesson.'));
  if(lesson&&lesson.baseVersion)out.contentVersion=lesson.baseVersion;
  return out;
}

function checkOverlay(pack,overlay,lessonWords){
  const word=v=>lessonWords.find(w=>w.id===v||w.text.toLowerCase()===String(v).toLowerCase());
  if(overlay.sourceVersion!==pack.contentVersion)return OLD;
  const scenes=pack.modules.story.length,dialogues=new Set((pack.modules.dialogue||[]).map(d=>d.id));
  for(const q of overlay.quiz||[]){
    if(!Number.isInteger(q.afterScene)||q.afterScene<1||q.afterScene>scenes)return '题目源文件无效：afterScene 超出故事幕数';
    if(!Array.isArray(q.options)||q.options.some(o=>!word(o))||!word(q.answer))return '题目源文件无效：选项或答案不是本课单词';
    if(!q.options.some(o=>word(o).id===word(q.answer).id))return '题目源文件无效：答案不在选项里';
  }
  for(const r of overlay.replies||[]){
    if(!dialogues.has(r.dialogueId))return '题目源文件无效：dialogueId 不存在';
    if(!word(r.word))return '题目源文件无效：word 不是本课单词';
  }
  return null;
}

function findFill(pack,words){
  for(const story of pack.modules.story)for(const seg of story.segments){
    const hits=words.map(w=>({w,m:new RegExp('\\b'+esc(w.text)+'\\b','i').exec(seg.text)})).filter(h=>h.m);
    if(!hits.length)continue;
    const hit=hits.find(h=>h.w.id===story.mainWord)||hits.reduce((a,b)=>b.m.index<a.m.index?b:a);
    const {w,m}=hit;
    return {segmentId:seg.id,before:seg.text.slice(0,m.index),after:seg.text.slice(m.index+m[0].length),image:story.illustration||w.image,answer:w.id};
  }
  return null;
}

// Review cards reuse another scene's word and files, registered as lesson-layer assets.
function reviewCards(sid,link,assets){
  const cards=[];
  for(const r of link&&link.review||[]){
    const src=link.packs[r.sceneId],w=src.words.find(x=>x.id===r.wordId),id=sid+'.lesson.review.'+w.id;
    for(const k of ['image','audio']){
      const a=src.assets.find(x=>x.id===w[k]);
      assets.push({...a,id:id+'.'+k});
    }
    cards.push({id,text:w.text,cn:w.cn,image:id+'.image',audio:id+'.audio',from:src.title.replace(/^和 Momo /,'')});
  }
  return cards;
}

function buildLesson(basePack,overlay,link=null){
  const pack=stripLesson(basePack),sid=pack.sceneId,warnings=[],assets=[],m=pack.modules;
  const lessonWords=m.summary.map(id=>pack.words.find(w=>w.id===id)).filter(Boolean),ids=lessonWords.map(w=>w.id);
  let ov=overlay||null;
  if(ov){const bad=checkOverlay(pack,ov,lessonWords);if(bad){warnings.push(bad);ov=null;}}
  const wid=v=>lessonWords.find(w=>w.id===v||w.text.toLowerCase()===String(v).toLowerCase()).id;
  const quizzes=ov?[...(ov.quiz||[])].sort((a,b)=>a.afterScene-b.afterScene):[];
  const steps=[{id:sid+'.lesson.words',kind:'words',words:ids}];
  const review=reviewCards(sid,link,assets);
  if(review.length)steps[0].review=review;
  let k=0;
  m.story.forEach((s,i)=>{
    steps.push({id:sid+'.lesson.story.'+(i+1),kind:'story',storyId:s.id});
    for(const q of quizzes.filter(q=>q.afterScene===i+1))
      steps.push({id:sid+'.lesson.quiz.'+(++k),kind:'quiz',question:q.question,options:q.options.map(wid),answer:wid(q.answer),review:true});
  });
  const fill=findFill(pack,lessonWords);
  if(fill)steps.push({id:sid+'.lesson.fill',kind:'fill',segmentId:fill.segmentId,before:fill.before,after:fill.after,image:fill.image,options:ids,answer:fill.answer});
  else warnings.push('未找到含本课单词的句子，已跳过 fill 步骤');
  if(ov&&(ov.replies||[]).length){
    const rounds=ov.replies.map(r=>{
      const d=m.dialogue.find(d=>d.id===r.dialogueId),h=sha8(r.text),audio=sid+'.lesson.wrong.'+h+'.audio';
      if(!assets.some(a=>a.id===audio))assets.push({id:audio,kind:'audio',path:'audio/'+sid+'/lesson/'+h+'.wav',text:r.text,language:'en-US',role:'bunny',source:null,rights:null,reviewed:false});
      const w=lessonWords.find(w=>w.id===wid(r.word));
      return {dialogueId:r.dialogueId,answer:d.options[0].id,wrong:{id:r.dialogueId+'.wrong.'+h,text:r.text,cn:r.cn,image:w.image,audio}};
    });
    steps.push({id:sid+'.lesson.reply',kind:'reply',review:true,rounds});
  }
  steps.push({id:sid+'.lesson.game',kind:'game'},{id:sid+'.lesson.match',kind:'match',words:ids},{id:sid+'.lesson.end',kind:'end'});
  const lesson={schemaVersion:1,baseVersion:pack.contentVersion,reviewed:!!(ov&&ov.reviewed===true),steps};
  if(link&&link.bridge){
    const {text,cn}=link.bridge,audio=sid+'.lesson.bridge.audio';
    assets.push({id:audio,kind:'audio',path:'audio/'+sid+'/lesson/bridge-'+sha8(text)+'.wav',text,language:'en-US',role:'momo',source:null,rights:null,reviewed:false});
    lesson.bridge={text,cn,audio};
  }
  return {lesson,assets,warnings};
}

function finalizeLesson(basePack,overlay,previousPack,link=null){
  const base=stripLesson(basePack),{lesson,assets,warnings}=buildLesson(base,overlay,link);
  const pack={...base,assets:[...base.assets,...assets],lesson};
  const rest=p=>{const c=clone(p);delete c.contentVersion;delete c.compatibleFrom;return c;};
  if(previousPack){
    if(same(rest(pack),rest(previousPack))){pack.contentVersion=previousPack.contentVersion;pack.compatibleFrom=previousPack.compatibleFrom;}
    else if(cmp(base.contentVersion,previousPack.contentVersion)>0){/* author bumped */}
    else{
      const [a,b,c]=semver(previousPack.contentVersion);
      pack.contentVersion=[a,b,c+1].join('.');
      pack.compatibleFrom=[...new Set([...(base.compatibleFrom||[]),...(previousPack.compatibleFrom||[]),previousPack.contentVersion])];
    }
  }
  return {pack,warnings};
}

module.exports={buildLesson,finalizeLesson,stripLesson};

if(require.main===module){
  const id=process.argv[2];
  if(!id){console.error('usage: node lesson-build.cjs <sceneId>');process.exit(1);}
  const {validate}=require('./static/core/model.js');
  const file=path.join(__dirname,'static/content',id+'.json'),ovFile=path.join(__dirname,'content-lesson',id+'.json');
  const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
  const catalog=read(path.join(__dirname,'static/content/catalog.json'));
  const packsById=Object.fromEntries((catalog.days||[]).flatMap(d=>d.route).filter(r=>fs.existsSync(path.join(__dirname,'static/content',r.id+'.json'))).map(r=>[r.id,read(path.join(__dirname,'static/content',r.id+'.json'))]));
  const daysDir=path.join(__dirname,'content-days'),extraBridges={};
  if(fs.existsSync(daysDir))for(const f of fs.readdirSync(daysDir).filter(f=>f.endsWith('.json')))for(const l of read(path.join(daysDir,f)).plan?.levels||[])extraBridges[l.scene_id]={text:l.bridge_en,cn:l.bridge_cn};
  const previous=read(file),overlay=fs.existsSync(ovFile)?read(ovFile):null;
  const {pack,warnings}=finalizeLesson(previous,overlay,previous,lessonLink(catalog,packsById,id,extraBridges));
  const result=validate(pack,{exists:p=>p.includes('/lesson/')||fs.existsSync(path.join(__dirname,'static',p))});
  if(result.errors.length){console.error(result.errors.join('\n'));process.exit(1);}
  if(!same(pack,previous)){
    const archive=path.join(__dirname,'static/content/archive',previous.sceneId+'.'+previous.contentVersion+'.json');
    fs.mkdirSync(path.dirname(archive),{recursive:true});
    if(!fs.existsSync(archive))fs.writeFileSync(archive,JSON.stringify(previous,null,2)+'\n');
    fs.writeFileSync(file,JSON.stringify(pack,null,2)+'\n');
    console.log(id+': '+previous.contentVersion+' -> '+pack.contentVersion);
  }else console.log(id+': unchanged');
  for(const w of warnings)console.log('warning: '+w);
}
