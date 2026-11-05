import {node,image} from '../core/dom.mjs?v=storyboard-20261103';
const root=document.querySelector('#review-content'),status=document.querySelector('#review-status');
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
function render(pack){
  const section=node('section',undefined,'review-theme');section.id=pack.sceneId;
  section.append(node('h2',pack.title),node('p','目标：'+pack.learning.goal),node('p','表达：'+pack.learning.function),node('p','草稿版本 '+pack.contentVersion+' · 尚未批准发布'));
  const words=node('div');
  for(const w of pack.words){const card=node('div',undefined,'review-word');card.append(picture(pack,w.image,w.cn),node('b',w.text),node('small',w.cn));words.append(card);}
  const wordAudio=node('details');wordAudio.append(node('summary','逐词试听'));for(const w of pack.words)wordAudio.append(sound(pack,w.audio));section.append(words,wordAudio);
  for(const scene of pack.modules.story){const story=node('article',undefined,'review-scene');story.append(node('h3',scene.title),picture(pack,scene.illustration,scene.translation,'review-art'),node('p',scene.translation));for(const line of scene.segments)story.append(sound(pack,line.audio));section.append(story);}
  const dialogue=node('details');dialogue.append(node('summary','对话 · '+pack.modules.dialogue.length+' 轮，展开逐条审阅'));
  for(const [i,r]of pack.modules.dialogue.entries()){const round=node('article',undefined,'review-round');round.append(node('h3','第 '+(i+1)+' 轮'),node('p',r.cn));for(const line of r.question)round.append(sound(pack,line.audio));for(const o of r.options){round.append(node('p','回应：'+o.cn),sound(pack,o.audio));for(const line of o.followUp)round.append(sound(pack,line.audio));}dialogue.append(round);}section.append(dialogue);
  const game=node('details');game.append(node('summary','游戏 · '+pack.modules.game.questions.length+' 题，查看任务'));
  for(const q of pack.modules.game.questions){const w=pack.words.find(w=>w.id===q.target),zone=pack.modules.game.zones?.find(z=>z.id===q.zone);game.append(node('p',q.solution?q.instructions+' '+q.solution.map(id=>q.labels[id]).join(' → '):w.text+' · '+w.cn+(zone?' → '+zone.label:' → 听音找图')));}section.append(game);root.append(section);
}
try{
  const catalog=await json('../content/catalog.json');
  const ids=[...new Set([...(catalog.previewScenes||[]),...catalog.releasedScenes])];
  for(const id of ids){if(!/^content\/[a-z0-9-]+\.json$/.test(catalog.scenes[id]))throw Error('内容路径无效');const pack=await json('../'+catalog.scenes[id]);loaded.push(pack);render(pack);const link=node('a',pack.title);link.href='#'+id;document.querySelector('#review-nav').append(link);}
  status.textContent='已加载 '+loaded.length+' 个草稿主题。按主题查看故事，并展开逐词、对话和游戏审阅。';
}catch(e){status.textContent='读取失败：'+e.message;}
document.addEventListener('visibilitychange',()=>{if(document.hidden)activeAudio?.pause();});
document.querySelector('#download-notes').addEventListener('click',()=>{
  const report={capturedAt:new Date().toISOString(),type:'content-review-notes',releaseApproved:false,
    contentVersions:Object.fromEntries(loaded.map(p=>[p.sceneId,p.contentVersion])),notes:document.querySelector('#review-notes').value};
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
  const link=node('a');link.href=url;link.download='momoplanet-content-notes.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
