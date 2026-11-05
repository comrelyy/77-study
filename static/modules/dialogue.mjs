import {node,button,actions} from '../core/dom.mjs';
export function renderDialogue(c,s){
  const round=c.pack.modules.dialogue[s.index],wrap=node('section',undefined,'center');wrap.append(node('div','LET’S TALK · '+(s.index+1)+' / '+c.pack.modules.dialogue.length,'eyebrow'),node('h1','和 Momo 接着聊'),node('p',c.pack.title+' · 点一个回答，朋友就会接着说。随时可以暂停或结束。'));
  const bubble=node('div',undefined,'conversation'),speech=node('div',undefined,'speech-bubble');speech.append(node('b',round.question.map(x=>x.text).join(' ')));if(round.cn)speech.append(node('small',round.cn));bubble.append(c.assetImage(c.pack.modules.story[0].characters[0]),speech);wrap.append(bubble);
  if(s.done){const selected=round.options.find(o=>o.id===s.selection);if(selected){const exchange=node('section',undefined,'dialogue-exchange');exchange.setAttribute('aria-label','这次说过的话');const reply=node('div',undefined,'conversation'),replyBubble=node('div',undefined,'speech-bubble');replyBubble.append(node('small','小兔'),node('p',selected.text));reply.append(c.assetImage(c.pack.modules.story[0].characters[1]||c.pack.modules.story[0].characters[0]),replyBubble);exchange.append(reply);for(const line of selected.followUp){const follow=node('div',undefined,'conversation'),followBubble=node('div',undefined,'speech-bubble');followBubble.append(node('small','Momo'),node('p',line.text));follow.append(c.assetImage(c.pack.modules.story[0].characters[0]),followBubble);exchange.append(follow);}wrap.append(exchange);}}
  const choices=node('div',undefined,'reply-options');
  for(const o of round.options){const b=button('',async()=>{if(!c.active()||!s.select(o.id))return;c.pause();const saving=s.confirm();c.lock();const ok=await saving;if(c.active()){c.redraw();if(ok)await c.app.dialogueSpeech(s);}},'reply-card'+(s.selection===o.id?' chosen':''));b.disabled=s.busy||s.done;b.setAttribute('aria-pressed',String(s.selection===o.id));b.append(c.assetImage(o.image),node('b',o.text),node('small',o.cn));if(s.selection===o.id)b.append(node('small','✓ 这次回答'));choices.append(b);}wrap.append(choices);
  const controls=actions(button('听听问题',()=>c.sequence(round.question)),button('暂停声音',()=>{c.pause();c.app.checkpoint('dialogue');}),button('听听怎么玩',()=>c.guide('dialogue')));
  if(!s.done)controls.append(button('示范回答',()=>{c.pause();c.app.message('先听一个示范，也可以直接点你想说的回答。');return c.app.playAsset(round.options[0].audio);}));
  else controls.prepend(button(s.speechIndex>=1+(round.options.find(x=>x.id===s.selection)?.followUp.length||0)?'重听这次对话':'继续对话',async()=>{if(s.speechIndex>=1+round.options.find(x=>x.id===s.selection).followUp.length){s.speechIndex=0;if(!await c.sequence(round.question)||!c.active())return;}await c.app.dialogueSpeech(s);},'primary'));
  controls.append(button(s.done?'下一轮':'先跳过',()=>{c.pause();if(c.app.integratedInteractions&&s.done)return c.app.advanceDialogue(s);if(s.next()){s.speechIndex=0;c.redraw();c.app.checkpoint('dialogue');}else c.complete();}));wrap.append(controls,c.messageNode);
  if(s.events.length){
    const history=node('section',undefined,'dialogue-history');history.setAttribute('aria-label','围绕主题的对话记录');history.append(node('h2','我们刚才聊到……'));
    for(const event of s.events){
      const previous=c.pack.modules.dialogue.find(r=>r.id===event.stepId),answer=previous?.options.find(o=>o.id===event.selectedId);if(!answer)continue;
      history.append(node('p','Momo: '+previous.question.map(x=>x.text).join(' ')),node('p','小兔: '+answer.text));
      for(const follow of answer.followUp)history.append(node('p','Momo: '+follow.text));
    }
    wrap.append(history);
  }c.body.append(wrap);
}
