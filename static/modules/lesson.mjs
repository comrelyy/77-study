import {node,button,image,actions} from '../core/dom.mjs';
import {renderGame} from './game.mjs?v=lesson-20261109';
const ui=new WeakMap();
const speakers={narrator:'故事',momo:'Momo 墨墨',bunny:'Lulu 露露',fox:'Fifi 菲菲',turtle:'Toto 托托'};
function mine(s){if(!ui.has(s))ui.set(s,{wrong:null});return ui.get(s);}
function advance(c,s){
  const at=s.index;
  return ()=>{if(s.index!==at||!c.active())return;c.pause();if(s.next()){c.redraw();c.app.body.scrollIntoView?.({block:'start'});c.app.checkpoint('lesson');}};
}
function progressBar(s){
  const bar=node('div',undefined,'lesson-progress'),fill=node('b'),ratio=s.steps.length>1?s.index/(s.steps.length-1):1;
  fill.style.width=Math.round(ratio*100)+'%';bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');bar.setAttribute('aria-valuenow',String(Math.round(ratio*100)));bar.setAttribute('aria-label','这节课的进度');bar.append(fill);return bar;
}
function footer(c,...extra){
  return actions(...extra,button('暂停声音',()=>{c.pause();c.app.checkpoint('lesson');}),button('听听怎么玩',()=>c.guide('lesson')));
}
function skipButton(c,s){return button('下一步 / 跳过',advance(c,s));}
function continueButton(c,s){return button('继续',advance(c,s),'primary');}
function optionClass(base,s,id){
  const u=mine(s);
  return base+(u.wrong===id&&!s.done?' lesson-shake':'')+(s.revealed&&id===s.correctId()?' lesson-reveal':'')+(s.done&&id===s.correctId()?' lesson-right':'');
}
// The answer is saved first; the screen state moves only after the save is confirmed.
async function choose(c,s,selectedId,after){
  const step=s.step,kind=step.kind;
  if(!c.active()||s.done||(s.revealed&&kind!=='match'))return;
  const correct=selectedId===s.correctId(),payload={moduleId:'lesson',mode:'lesson_answer',stepId:step.id,selectedId,attempt:s.attempts+1,correct};
  if(kind==='match')payload.targetId=s.target;
  if(kind==='reply')payload.roundIndex=s.roundIndex;
  const u=mine(s);let result;
  const ok=await c.app.emit('choice',payload,c.app.uuid(),()=>{result=s.answer(selectedId);u.wrong=correct?null:selectedId;});
  if(!ok||!result||!c.active())return;
  c.redraw();
  if(correct)c.message(s.done?'答对啦！':'对啦，再来一个。');
  else c.message(result.revealed?'看看这个答案，听一听，然后继续。':'再试试');
  if(correct)await after.right();
  else if(result.revealed)await after.reveal();
  else await after.wrong?.();
}
function wordTile(c,s,id,after,showText=true){
  const w=c.word(id),b=button('',()=>choose(c,s,id,after),optionClass('lesson-pick',s,id));
  b.setAttribute('data-id',id);b.append(c.assetImage(w.image,''));if(showText)b.append(node('b',w.text));else b.setAttribute('aria-label',w.cn);b.disabled=s.done||(s.revealed&&s.step.kind!=='match');return b;
}
function renderWords(c,s,wrap){
  const step=s.step;wrap.append(node('h2','先认识今天的小伙伴','lesson-title'),node('p','点图卡听一听，不用全部点完。'));
  const grid=node('div',undefined,'word-grid');
  for(const id of step.words){const w=c.word(id),b=button('',async()=>{const ok=await c.hearWord(w);if(ok&&c.active()){c.redraw();c.message('听完 '+w.text+' 啦，可以再听，也可以继续。');}},'word-card');b.append(c.assetImage(w.image),node('b',w.text),node('small',w.cn));grid.append(b);}
  wrap.append(grid,footer(c,skipButton(c,s)),c.messageNode);
}
function renderStory(c,s,wrap){
  const story=s.story,scene=story.scene,list=node('div',undefined,'lesson-story');
  wrap.append(node('h2',scene.title,'lesson-title'));
  for(const [i,seg] of scene.segments.entries()){
    const b=button('',()=>{story.pause();c.pause();return c.play(seg.audio);},'lesson-bubble'+(seg.speaker==='narrator'?' narrator':'')+(i===story.fragment?' current-fragment':''));
    if(seg.speaker&&seg.speaker!=='narrator'&&seg.speaker in speakers)b.append(image('illustrations/'+seg.speaker+'.svg',speakers[seg.speaker],'lesson-avatar'));
    const text=node('span',undefined,'lesson-bubble-text');text.append(node('small',speakers[seg.speaker]||seg.speaker||'','story-speaker'),node('span',seg.text));b.append(text);list.append(b);
  }
  wrap.append(list);
  const translation=node('details',undefined,'translation');translation.append(node('summary','看看中文意思'),node('p',scene.translation));wrap.append(translation);
  async function startStory(){
    if(!c.active())return;c.pause();if(story.saved||story.fragment>=scene.segments.length)story.replay();listen.disabled=true;
    const playing=story.play(seg=>{list.querySelectorAll('.lesson-bubble').forEach((p,i)=>p.className=p.className.replace(' current-fragment','')+(scene.segments[i]===seg?' current-fragment':''));return c.play(seg.audio);},snapshot=>c.emit('choice',{mode:'story_listen',...snapshot}),()=>c.app.checkpoint('lesson'));
    const run=story.run,ok=await playing;
    if(c.active()&&run===story.run){c.redraw();c.message(ok?'这一幕听完啦，可以重听，也可以继续。':'声音暂未播放完成。可以点“听这一幕”再试，也可以继续。');}
  }
  const listen=button(story.fragment&&story.fragment<scene.segments.length?'继续这一幕':'听这一幕',startStory,'primary');
  wrap.append(footer(c,listen,skipButton(c,s)),c.messageNode);
}
function renderQuiz(c,s,wrap){
  const step=s.step,after={right:()=>c.play(c.word(step.answer).audio),reveal:()=>c.play(c.word(step.answer).audio)};
  wrap.append(node('h2',step.question,'lesson-question'),node('p','点你觉得对的图。'));
  const pics=node('div',undefined,'lesson-picks');for(const id of step.options)pics.append(wordTile(c,s,id,after));
  wrap.append(pics,footer(c,...(s.canContinue()?[continueButton(c,s)]:[])),c.messageNode);
}
function segmentOf(c,id){for(const story of c.pack.modules.story){const seg=story.segments.find(x=>x.id===id);if(seg)return seg;}return null;}
function renderFill(c,s,wrap){
  const step=s.step,seg=segmentOf(c,step.segmentId),after={right:()=>seg?c.play(seg.audio):true,reveal:()=>c.play(c.word(step.answer).audio)};
  wrap.append(node('h2','选一个词，把句子补完整'));
  const art=node('div',undefined,'lesson-scene');art.append(c.assetImage(step.image,''));wrap.append(art);
  const sentence=node('p',undefined,'lesson-sentence'),blank=node('span',s.done||s.revealed?c.word(step.answer).text:'',`lesson-blank${s.done?' filled':''}`);
  sentence.append(node('span',step.before),blank,node('span',step.after));wrap.append(sentence);
  const chips=node('div',undefined,'lesson-chips');
  for(const id of step.options){const w=c.word(id),b=button(w.text,()=>choose(c,s,id,after),optionClass('lesson-chip',s,id));b.setAttribute('data-id',id);b.disabled=s.done||s.revealed;chips.append(b);}
  const hear=button('听这句话',()=>{c.pause();return seg?c.play(seg.audio):true;});
  wrap.append(chips,footer(c,hear,...(s.canContinue()?[continueButton(c,s)]:[])),c.messageNode);
}
function renderReply(c,s,wrap){
  const step=s.step,round=step.rounds[s.roundIndex],dialogue=c.pack.modules.dialogue.find(d=>d.id===round.dialogueId),right=dialogue.options.find(o=>o.id===round.answer);
  const choices=[{id:right.id,text:right.text,cn:right.cn,image:right.image,audio:right.audio},{id:round.wrong.id,text:round.wrong.text,cn:round.wrong.cn,image:round.wrong.image,audio:round.wrong.audio}];
  if(s.roundIndex%2)choices.reverse();
  wrap.append(node('h2','完成对话','lesson-title'));
  const ask=node('div',undefined,'conversation'),bubble=node('div',undefined,'speech-bubble');
  bubble.append(node('b',dialogue.question.map(x=>x.text).join(' ')));if(dialogue.cn)bubble.append(node('small',dialogue.cn));
  ask.append(c.assetImage(c.pack.modules.story[0].characters[0]),bubble);wrap.append(ask,node('p','Lulu 该怎么回答？点一个。'));
  const opts=node('div',undefined,'lesson-replies');
  for(const o of choices){
    const say=()=>c.play(o.audio),after={right:say,wrong:say,reveal:()=>c.play(right.audio)};
    const b=button('',()=>choose(c,s,o.id,after),optionClass('lesson-opt',s,o.id));b.setAttribute('data-id',o.id);
    b.append(c.assetImage(o.image,''),node('span',undefined,'lesson-opt-text'));b.children[1].append(node('b',o.text),node('small',o.cn));b.disabled=s.done||s.revealed;opts.append(b);
  }
  const hear=button('听听问题',()=>{c.pause();return c.sequence(dialogue.question);});
  wrap.append(opts,footer(c,hear,...(s.canContinue()?[continueButton(c,s)]:[])),c.messageNode);
}
function renderMatch(c,s,wrap){
  const step=s.step,target=s.target,after={right:async()=>{if(s.target)await c.play(c.word(s.target).audio);},reveal:()=>c.play(c.word(target).audio)};
  wrap.append(node('h2','听一听，配一配','lesson-title'),node('p','点“听一听”，再找到对应的图。'));
  const grid=node('div',undefined,'lesson-match'),left=node('div',undefined,'lesson-targets'),right=node('div',undefined,'lesson-picks');
  for(const id of step.words){
    const w=c.word(id),done=s.matched.has(id);
    if(done)left.append(node('span',w.text,'lesson-target-done'));
    else if(id===target){const t=button('',()=>{c.pause();return c.play(w.audio);},'lesson-target');t.setAttribute('aria-label','听一听');t.append(image('illustrations/wave.svg','','lesson-wave'),node('b','听一听'));left.append(t);}
    else left.append(node('span','?','lesson-target-wait'));
    const pic=wordTile(c,s,id,after,false);pic.className+=done?' lesson-matched':'';pic.disabled=done||s.done;right.append(pic);
  }
  grid.append(left,right);wrap.append(grid,footer(c,...(s.canContinue()?[continueButton(c,s)]:[])),c.messageNode);
}
function renderEnd(c,s,wrap){
  const earned=c.app.data.events.some(e=>e.kind==='sticker'&&e.payload?.theme===c.pack.sceneId);
  wrap.append(node('h2','这节课完成啦','lesson-title'),image(earned?c.app.memoryImage():'illustrations/cloud.svg','','sticker'),node('p',earned?'相伴纪念已收藏。':'谢谢你一起玩。'));
  const words=node('div',undefined,'lesson-end-words');
  for(const id of s.steps.find(x=>x.kind==='words').words){const w=c.word(id),item=node('span',undefined,'lesson-end-word');item.append(c.assetImage(w.image,''),node('b',w.text));words.append(item);}
  wrap.append(words,actions(button('再玩一次',()=>c.app.open('lesson',true),'primary'),button('回首页',()=>c.app.home())),c.messageNode);
}
export function renderLesson(c,s){
  const step=s.step;
  if(step.kind==='game'){
    c.body.append(progressBar(s));
    const game=c.app.stateFor('game'),finish=()=>{
      if(c.app.advancingLesson)return;c.app.advancingLesson=true;
      return (async()=>{
        try{
          const generation=c.app.generation;c.pause();
          game.finished=true;
          if(!await c.app.checkpoint('game')||generation!==c.app.generation)return;
          if(s.next()){c.redraw();await c.app.checkpoint('lesson');}
        }finally{c.app.advancingLesson=false;}
      })();
    };
    renderGame({...c,inLesson:true,advanceGame:finish,complete:finish},game);return;
  }
  const wrap=node('section',undefined,'center lesson');wrap.append(progressBar(s));
  ({words:renderWords,story:renderStory,quiz:renderQuiz,fill:renderFill,reply:renderReply,match:renderMatch,end:renderEnd})[step.kind](c,s,wrap);
  c.body.append(wrap);
}
