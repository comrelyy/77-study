import {node,image} from '../core/dom.mjs?v=storyboard-20261103';
const live=typeof document!=='undefined'&&document.querySelector&&document.querySelector('#review-content'),root=live||null,status=live&&document.querySelector('#review-status');
const loaded=[];let activeAudio=null;
async function json(file){const r=await fetch(file,{cache:'no-store'});if(!r.ok)throw Error('无法读取 '+file);return r.json();}
function sound(pack,audioId){
  const asset=pack.assets.find(a=>a.id===audioId),wrap=node('div',undefined,'review-line');
  const copy=node('div');copy.append(node('small',({narrator:'故事旁白',momo:'Momo 墨墨',bunny:'Lulu 露露',fox:'Fifi 菲菲',turtle:'Toto 托托'})[asset.role]||asset.role,'review-role'),node('p',asset.text));
  const audio=node('audio');audio.controls=true;audio.preload='none';audio.src='../'+asset.path;audio.setAttribute('aria-label','试听：'+asset.text);
  audio.addEventListener('play',()=>{if(activeAudio&&activeAudio!==audio){activeAudio.pause();activeAudio.currentTime=0;}activeAudio=audio;});
  wrap.append(copy,audio);return wrap;
}
function picture(pack,id,alt,className){return image('../'+pack.assets.find(a=>a.id===id).path,alt,className);}
export function renderPack(pack){
  const section=node('section',undefined,'review-theme');section.id=pack.sceneId;
  section.append(node('h2',pack.title),node('p','目标：'+pack.learning.goal),node('p','表达：'+pack.learning.function),node('p','草稿版本 '+pack.contentVersion+' · 尚未批准发布'));
  const words=node('div');
  for(const w of pack.words){const card=node('div',undefined,'review-word');card.append(picture(pack,w.image,w.cn),node('b',w.text),node('small',w.cn));words.append(card);}
  const wordAudio=node('details');wordAudio.append(node('summary','逐词试听'));for(const w of pack.words)wordAudio.append(sound(pack,w.audio));section.append(words,wordAudio);
  for(const scene of pack.modules.story){const story=node('article',undefined,'review-scene');story.append(node('h3',scene.title),picture(pack,scene.illustration,scene.translation,'review-art'),node('p',scene.translation));for(const line of scene.segments)story.append(sound(pack,line.audio));section.append(story);}
  const dialogue=node('details');dialogue.append(node('summary','对话 · '+pack.modules.dialogue.length+' 轮，展开逐条审阅'));
  for(const [i,r]of pack.modules.dialogue.entries()){const round=node('article',undefined,'review-round');round.append(node('h3','第 '+(i+1)+' 轮'),node('p',r.cn));for(const line of r.question)round.append(sound(pack,line.audio));for(const o of r.options){round.append(node('p','回应：'+o.cn),sound(pack,o.audio));for(const line of o.followUp)round.append(sound(pack,line.audio));}dialogue.append(round);}section.append(dialogue);
  const game=node('details');game.append(node('summary','游戏 · '+pack.modules.game.questions.length+' 题，查看任务'));
  for(const q of pack.modules.game.questions){const w=pack.words.find(w=>w.id===q.target),zone=pack.modules.game.zones?.find(z=>z.id===q.zone);game.append(node('p',q.solution?q.instructions+' '+q.solution.map(id=>q.labels[id]).join(' → '):w.text+' · '+w.cn+(zone?' → '+zone.label:' → 听音找图')));}section.append(game);return section;
}
const COMMANDS=id=>'python -m momo_agent day-picture-approve '+id+' <词>，整天看完后 python -m momo_agent day-approve '+id;
export function renderDay(into,day,getPack,snapshot){
  const section=node('section',undefined,'review-day');section.id='day-'+day.id;
  section.append(node('h2',day.title+' · '+(day.approved===true?'已批准':'未批准')));
  if(day.id!=='everyday')section.append(node('p','批准只用命令行：'+COMMANDS(day.id),'review-commands'));
  const pics=Object.entries(snapshot?.pictures||{});
  if(pics.length){const grid=node('div',undefined,'review-newpics');for(const [word,p]of pics){const card=node('div',undefined,'review-newpic');card.append(image('../'+p.path,word,'review-newpic-art'),node('b',word),node('small',p.status==='approved'?'已通过':'待审'));grid.append(card);}section.append(node('h3','新图 · '+pics.length+' 张'),grid);}
  for(const r of day.route)section.append(renderPack(getPack(r.id)));
  into.append(section);return section;
}
if(root)try{
  const catalog=await json('../content/catalog.json'),packs={},nav=document.querySelector('#review-nav');
  const load=async id=>{if(!/^content\/[a-z0-9-]+\.json$/.test(catalog.scenes[id]))throw Error('内容路径无效');if(!packs[id]){packs[id]=await json('../'+catalog.scenes[id]);loaded.push(packs[id]);}return packs[id];};
  const link=(text,href)=>{const a=node('a',text);a.href=href;nav.append(a);};
  const inDays=new Set((catalog.days||[]).flatMap(d=>d.route.map(r=>r.id)));
  for(const day of catalog.days||[]){
    for(const r of day.route)await load(r.id);
    const snapshot=await json('days/'+day.id+'.json').catch(()=>null);
    renderDay(root,day,id=>packs[id],snapshot);link(day.title,'#day-'+day.id);
  }
  for(const id of new Set([...(catalog.previewScenes||[]),...catalog.releasedScenes]))if(!inDays.has(id)){const pack=await load(id);root.append(renderPack(pack));link(pack.title,'#'+id);}
  status.textContent='已加载 '+loaded.length+' 个主题，分 '+(catalog.days||[]).length+' 天。按天查看；未批准的天先看新图，再看各关。';
}catch(e){status.textContent='读取失败：'+e.message;}
if(root){
document.addEventListener('visibilitychange',()=>{if(document.hidden)activeAudio?.pause();});
document.querySelector('#download-notes').addEventListener('click',()=>{
  const report={capturedAt:new Date().toISOString(),type:'content-review-notes',releaseApproved:false,
    contentVersions:Object.fromEntries(loaded.map(p=>[p.sceneId,p.contentVersion])),notes:document.querySelector('#review-notes').value};
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
  const link=node('a');link.href=url;link.download='momoplanet-content-notes.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
}
