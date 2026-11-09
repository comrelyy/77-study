import {node,button,actions,image} from '../core/dom.mjs';
const openCn=new Set();
function cnToggle(seg,target){
  const cn=node('span',seg.cn,'segment-cn');cn.hidden=!openCn.has(seg.id);
  const t=button('中',()=>{cn.hidden=!cn.hidden;if(cn.hidden)openCn.delete(seg.id);else openCn.add(seg.id);t.setAttribute('aria-pressed',String(!cn.hidden));},'cn-toggle');
  t.setAttribute('aria-label','看中文');t.setAttribute('aria-pressed',String(!cn.hidden));target.append(t,cn);
}
export function renderStory(c,s){
  const scene=s.scene,layout=node('div',undefined,'scene-layout'),art=node('div',undefined,'story-art sketch-story '+scene.templateId);
  art.append(node('div','STORY · '+(s.step+1)+' / '+s.scenes.length,'sketch-page-number'));
  if(scene.illustration){const landscape=c.assetImage(scene.illustration,scene.translation);landscape.className='story-landscape';art.append(landscape);}
  else if(scene.templateId==='picnic-meadow')art.append(image('picnic-sketch.svg','Momo 和朋友在草地上野餐','story-landscape'));
  else{const shelf=node('div',undefined,'tidy-shelf');for(const id of scene.characters)shelf.append(c.assetImage(id));art.append(shelf);}
  const wordTray=node('div',undefined,'story-word-tray');
  for(const hotspot of scene.hotspots){const w=c.word(hotspot.word),b=button('',async()=>{
    if(s.choosing)return;s.choosing=true;b.disabled=true;
    try{const playing=c.hearWord(w),run=s.run,ok=await playing;if(ok&&c.active()&&run===s.run){if(s.next()){c.redraw();c.app.body.scrollIntoView?.({block:'start'});await c.app.checkpoint('story');}else c.complete();}}
    finally{s.choosing=false;b.disabled=false;}
  },'food-prop sketch-food-prop');b.setAttribute('aria-label','听'+w.cn);b.append(c.assetImage(w.image),node('b',w.text),node('small','听完，去下一幕 →'));wordTray.append(b);}art.append(wordTray);
  const copy=node('div');copy.append(node('div','STORY · '+(s.step+1)+' / '+s.scenes.length,'eyebrow'),node('h1',scene.title));
  const english=node('div',undefined,'english-story');for(const [i,segment]of scene.segments.entries()){const p=node('p',undefined,i===s.fragment?'current-fragment':'');if(segment.speaker)p.append(node('small',({narrator:'故事',momo:'Momo 墨墨',bunny:'Lulu 露露',fox:'Fifi 菲菲',turtle:'Toto 托托'})[segment.speaker]||segment.speaker,'story-speaker'));p.append(node('span',segment.text));if(segment.cn)cnToggle(segment,p);english.append(p);}copy.append(english);
  async function startStory(restart=false){
    if(!c.active())return;
    // Keep Audio.play inside the click's task. Resetting/redrawing alone is not
    // replay, and awaiting a checkpoint first can lose browser user activation.
    c.pause();if(restart||s.saved||s.fragment>=scene.segments.length)s.replay();listen.disabled=true;
    const playing=s.play(segment=>{english.querySelectorAll('p').forEach((p,i)=>p.className=i===s.fragment?'current-fragment':'');return c.play(segment.audio);},snapshot=>c.emit('choice',{mode:'story_listen',...snapshot}),()=>c.app.checkpoint('story'));
    const run=s.run,ok=await playing;
    // A paused/replaced run must not redraw and stop its replacement audio.
    if(c.active()&&run===s.run){c.redraw();c.app.message(ok?'这一幕听完啦，可以重听，也可以自己选下一幕。':'声音暂未播放完成。可以点“听英语故事”或“继续这一幕”重试，也可以结束。');}
  }
  const listen=button(s.fragment&&s.fragment<scene.segments.length?'继续这一幕':'听英语故事',()=>startStory(),'primary');
  copy.append(actions(listen,button('暂停声音',()=>{s.pause();c.pause();c.app.checkpoint('story');c.message('已暂停，继续时重播当前短片段。');listen.disabled=false;listen.textContent=s.fragment&&s.fragment<scene.segments.length?'继续这一幕':'听英语故事';}),button('重听这一幕',()=>startStory(true))),c.messageNode);
  const previous=button('上一幕',()=>{c.pause();if(s.previous()){c.redraw();c.app.body.scrollIntoView?.({block:'start'});c.app.checkpoint('story');}});previous.disabled=s.step===0;
  copy.append(actions(previous,button('下一幕 / 跳过',()=>{s.pause();c.pause();if(s.next()){c.redraw();c.app.checkpoint('story');}else c.complete();}),button('听听怎么玩',()=>c.guide('story'))));layout.append(art,copy);c.body.append(layout);
}

