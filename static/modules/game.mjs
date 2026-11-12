import {renderNovelGame,tapHear,foundButton,targetPrompt,wordTag} from './game-novel.mjs?v=game-word-tag-20261112';
import {node,button,actions,image} from '../core/dom.mjs';
export function renderGame(c,s){
  if(['scene-find','story-order'].includes(c.pack.modules.game.type))return renderNovelGame(c,s);
  const game=c.pack.modules.game,q=game.questions[s.index],listening=game.type==='listen-pack',wrap=node('section',undefined,'center');if(!c.inLesson)wrap.append(node('div','LET’S PLAY · '+(s.index+1)+' / '+game.questions.length,'eyebrow'));wrap.append(node('h1',game.title||(listening?'帮 Momo 装好野餐篮':'把玩具送回自己的家')));
  if(!listening)wrap.append(node('p','这次请安放：'+c.word(q.target).cn));
  const prompt=targetPrompt(c,s,q),hear=()=>prompt(),items=[],found=listening?foundButton(c,s,prompt):null;
  if(listening)wrap.append(actions(button('听听要找什么',hear,'primary'),found));
  const options=node('div',undefined,'food-options');for(const id of s.candidates()){const w=c.word(id),b=button('',async()=>{
    if(listening)return tapHear(c,s,id,items,found);
    if(!s.select(id))return;c.redraw();c.app.checkpoint('game');
  },'food-tile'+(s.selection===id?' highlight':''));items.push([id,b]);b.disabled=listening?s.busy:s.busy||s.done;b.setAttribute('aria-label',w.cn);b.setAttribute('aria-pressed',String(s.selection===id));b.append(c.assetImage(w.image));if(s.selection===id)b.append(...(listening?[wordTag(w)]:[]),node('small','✓ '+(s.demoUsed&&id===q.target?'Momo 示范':'已选中')));options.append(b);}wrap.append(options);
  if(listening){const basket=node('div',undefined,'game-basket');if(s.done)basket.append(c.assetImage(c.word(q.target).image));if(game.collectionImage||c.pack.sceneId==='picnic')basket.append(image(game.collectionImage||'illustrations/basket.svg','收集篮'));wrap.append(basket);}
  else{const zones=actions();for(const z of game.zones){const b=button('放到'+z.label,async()=>{const saving=s.confirm(z.id);c.lock();await saving;if(c.active())c.redraw();},'storage-zone');b.disabled=!s.selection||s.busy||s.done;zones.append(b);}wrap.append(zones);}
  const controls=actions(button('看看怎么玩',()=>{s.help('instructions');c.guide('game');c.app.checkpoint('game');}),button('Momo 示范',()=>{if(s.help('demo')){c.pause();c.redraw();c.app.checkpoint('game');c.app.message(listening?'Momo 找到了这张图片。听完后，仍需你自己点“找到了”。':'Momo 找到了'+c.word(q.target).cn+'，要放到'+game.zones.find(z=>z.id===q.zone).label+'。仍需自己点收纳区。');}}),button('暂停声音',()=>{c.pause();c.app.checkpoint('game');}));
  if(listening)controls.append(button('再听一次',hear));controls.append(button(s.done?'继续':'先跳过',()=>{c.pause();if(c.advanceGame)return c.advanceGame();if(s.next()){c.redraw();c.app.checkpoint('game');}else c.complete();}));wrap.append(controls,c.messageNode);
  if(s.done)c.messageNode.textContent='放好了，谢谢你帮 Momo！';else if(s.attempts)c.messageNode.textContent='我们再试试，也可以重听、请 Momo 示范或跳过。';c.body.append(wrap);
}
