import {node,button,actions} from './dom.mjs';

// Newest valid source wins; unavailable sources do not hide an older usable one.
export function reviewWords(events,packs,available=()=>true){
  const selected=new Map();
  for(const event of [...events].reverse()){
    const p=event.payload||{};
    if(event.kind!=='introduced'||!p.wordId||selected.has(p.wordId))continue;
    const pack=packs.find(x=>x.sceneId===p.sceneId);
    const word=pack?.words.find(w=>w.id===p.wordId);
    if(!word||!(p.contentVersion===pack.contentVersion||pack.compatibleFrom?.includes(p.contentVersion)))continue;
    const audio=pack.assets.find(a=>a.id===word.audio),image=pack.assets.find(a=>a.id===word.image);
    if(!audio||!image||!available(audio.path)||!available(image.path))continue;
    selected.set(word.id,{word,pack});
    if(selected.size===2)break;
  }
  return [...selected.values()];
}

export function speedControls(app){
  const wrap=node('details',undefined,'notice');wrap.append(node('summary','播放语速'));
  const controls=actions();
  for(const [rate,label]of [[.8,'慢一点'],[1,'原速']]){
    const b=button(label,()=>{app.pause();app.player.setRate(rate);app.draw();app.message('语速已调整，请主动重听。');});
    b.setAttribute('aria-pressed',String(app.player.rate===rate));controls.append(b);
  }
  wrap.append(controls,node('p','本次页面有效。语速的清晰度仍需实际试听确认。'));return wrap;
}

export function observationForm(app){
  const wrap=node('details',undefined,'notice');wrap.append(node('summary','自愿补充观察'));
  wrap.append(node('p','只记录本次看到的操作，不推断掌握程度。不填即未知；不记录姓名。下载后由你保管。'));
  const fields={};
  for(const [key,title]of [['help','是否求助'],['refused','是否拒绝继续'],['ended','是否主动结束']]){
    const label=node('label',title+' '),select=node('select');
    for(const [value,text]of [['unknown','未知 / 未观察'],['yes','是'],['no','否']]){const option=node('option',text);option.value=value;select.append(option);}
    fields[key]=select;label.append(select);wrap.append(label);
  }
  wrap.append(button('下载观察补注',()=>{
    const record={schemaVersion:1,type:'voluntary-observation',createdAt:new Date().toISOString(),sceneId:app.pack.sceneId,contentVersion:app.pack.contentVersion,observations:Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value]))};
    const url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}));
    const link=node('a');link.href=url;link.download='momoplanet-observation.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);app.message('已请求下载，请检查浏览器下载记录。');
  }));return wrap;
}
