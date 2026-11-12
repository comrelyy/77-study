import {node,button,actions} from '../core/dom.mjs';
// Tap = hear that word and select it in place (a redraw would cut the sound); only 「找到了」 submits.
export function tapHear(c,s,id,items,found){
  const w=c.word(id);
  if(s.select(id)){for(const [x,b] of items){const on=x===id;b.setAttribute('aria-pressed',String(on));b.className=b.className.replace(/ (highlight|demo-hotspot)/g,'')+(on?' highlight':'');b.querySelector?.('small')?.remove();if(on&&b.className.includes('food-tile'))b.append(node('small','✓ 已选中'));}found.disabled=!s.heard||s.busy||s.done;c.app.checkpoint('game');}
  return w.audio?c.play(w.audio):undefined;
}
export function foundButton(c,s){const found=button('找到了',async()=>{if(!s.heard){c.message('先听完要找的词，再点“找到了”。');return;}if(!s.selection||s.busy||s.done)return;const task=s.confirm();c.lock();await task;if(c.active())c.redraw();},'primary lesson-found');found.disabled=!s.heard||!s.selection||s.busy||s.done;return found;}
export function renderNovelGame(c,s){
  const game=c.pack.modules.game,q=game.questions[s.index],ordering=game.type==='story-order';
  const wrap=node('section',undefined,'center');if(!c.inLesson)wrap.append(node('div','LET’S PLAY · '+(s.index+1)+' / '+game.questions.length,'eyebrow'));wrap.append(node('h1',game.title),node('p',q.instructions||game.instructions));
  async function save(){const task=s.confirm();c.lock();await task;if(c.active())c.redraw();}
  if(ordering){
    const slots=node('ol',undefined,'sequence-slots');slots.setAttribute('aria-label','我排好的故事');
    for(let i=0;i<q.solution.length;i++){const slot=node('li',undefined,'sequence-slot'),id=s.sequence[i];slot.append(node('small','第 '+(i+1)+' 步'));if(id){slot.append(c.assetImage(c.word(id).image),node('b',q.labels[id]));}else slot.append(node('span','选一张放这里'));slots.append(slot);}wrap.append(slots);
    const options=node('div',undefined,'food-options');for(const id of s.candidates()){const b=button('',()=>{if(s.select(id)){c.redraw();c.app.checkpoint('game');if(q.labelAudio?.[id])c.play(q.labelAudio[id]);}},'food-tile');b.append(c.assetImage(c.word(id).image),node('span',q.labels[id],'order-label'));b.disabled=s.done||s.busy||s.sequence.includes(id);options.append(b);}wrap.append(options);
    const confirm=button('故事排好了',save,'primary');confirm.disabled=s.done||s.busy||s.sequence.length!==q.solution.length;
    const undo=button('撤回最后一步',()=>{if(s.undoSequence()){c.redraw();c.app.checkpoint('game');}});undo.disabled=s.done||s.busy||!s.sequence.length;wrap.append(actions(confirm,undo));
  }else{
    const items=[],found=foundButton(c,s);
    const listen=button('听听要找什么',async()=>{if(!s.help('repeat'))return;s.heard=false;if(!await c.app.checkpoint('game'))return;const ok=await c.play(c.word(q.target).audio);if(c.active()){s.heard=ok;c.redraw();}},'primary');listen.disabled=s.busy||s.done;wrap.append(listen,found);
    const canvas=node('div',undefined,'find-scene');canvas.setAttribute('aria-label','在场景里找一找');const art=c.assetImage(game.illustration,'');art.className='find-scene-art';canvas.append(art);
    for(const h of game.hotspots.filter(h=>q.options.includes(h.word))){const w=c.word(h.word),b=button('',()=>tapHear(c,s,h.word,items,found),'game-hotspot'+(s.selection===h.word?(s.demoUsed?' demo-hotspot':' highlight'):''));items.push([h.word,b]);b.setAttribute('aria-label','选择'+w.cn);b.setAttribute('aria-pressed',String(s.selection===h.word));b.style.left=(h.x*100)+'%';b.style.top=(h.y*100)+'%';b.disabled=s.busy;canvas.append(b);}wrap.append(canvas);
  }
  wrap.append(actions(button('听听怎么玩',()=>{s.help('instructions');c.guide('game');c.app.checkpoint('game');}),button('请朋友示范',()=>{if(s.help('demo')){c.pause();c.redraw();c.app.checkpoint('game');c.app.message(ordering?'朋友排好了一个顺序。可以撤回重排，点确认才保存。':'朋友把目标圈出来了。请先听完，再自己点“找到了”。');}}),button('暂停声音',()=>{c.pause();c.app.checkpoint('game');}),button(s.done?'继续':'先跳过',()=>{c.pause();if(c.advanceGame)return c.advanceGame();if(s.next()){c.redraw();c.app.checkpoint('game');}else c.complete();})),c.messageNode);
  if(s.done)c.messageNode.textContent=ordering?'故事接起来啦！也可以回去再听听。':'找到了！谢谢你仔细观察。';
  else if(s.attempts)c.messageNode.textContent=ordering?'可以撤回最后一步，调整顺序再试试，也可以跳过。':'再仔细找找，可以重听、请人示范或跳过。';
  c.body.append(wrap);
}
