// One picnic conversation: keep the exchange on screen and continue after each reply.
let dialogueGeneration=0;
function dialogue(){
 const generation=++dialogueGeneration;
 const scenes=[
  {q:'Hello, Bunny! Come and sit with me. Would you like an apple?',cn:'你好，小兔！过来和我一起坐吧。想吃一个苹果吗？',options:[
   ['🍎','Yes, please!','好的，谢谢！','Here is an apple for you.','给你一个苹果。'],
   ['🍌','A banana, please.','我想要香蕉，谢谢。','Of course! Here is a banana for you.','当然！给你一根香蕉。'],
   ['👋','No, thank you.','不用了，谢谢。','That is okay. Let us sit together.','没关系。我们一起坐坐吧。']]},
  {q:'Look! We have apples and bananas. Shall we share the fruit?',cn:'看！我们有苹果和香蕉。一起分享水果好吗？',options:[
   ['🍌','Let us share a banana!','一起分享一根香蕉吧！','Good idea! One piece for you, one for me.','好主意！你一块，我一块。'],
   ['🍎','Let us share an apple!','一起分享一个苹果吧！','Good idea! Let us share this apple.','好主意！我们一起分享这个苹果。'],
   ['👋','Maybe later.','等一会儿吧。','Sure. We can save the fruit for later.','好的。我们把水果留到一会儿吃。']]},
  {q:'There is bread in our basket, too. Would you like some?',cn:'我们的篮子里还有面包。你想来一点吗？',options:[
   ['🍞','Yes, please!','好的，谢谢！','Here is some bread. A picnic with you is fun!','给你一些面包。和你一起野餐真开心！'],
   ['🐰','Let us share!','我们一起分享吧！','Thank you! Here is a piece for each of us.','谢谢！我们一人一块。'],
   ['👋','No, thank you.','不用了，谢谢。','That is okay. We can put the bread away.','没关系。我们可以把面包收好。']]},
  {q:'Now, let us have a drink. Would you like some milk?',cn:'现在来喝点东西吧。你想喝点牛奶吗？',options:[
   ['🥛','Yes, please!','好的，谢谢！','Here is your milk. Thank you for this lovely picnic!','给你牛奶。谢谢你和我一起度过这次愉快的野餐！'],
   ['💧','Water, please.','我想喝水，谢谢。','Here is your water. Thank you for this lovely picnic!','给你水。谢谢你和我一起度过这次愉快的野餐！'],
   ['👋','No, thank you.','不用了，谢谢。','That is okay. Thank you for this lovely picnic!','没关系。谢谢你和我一起度过这次愉快的野餐！']]}
 ];
 let run=0,answering=false,pending=null;
 const history=[];
 const valid=()=>generation===dialogueGeneration&&screen==='theme'&&chapter===1;
 const bubble=(en,cn,reply=false)=>`<div class="conversation ${reply?'reply':''}">${reply?'':'<span class="speaker-avatar">'+sketchIcon('momo','Momo')+'</span>'}<div class="speech-bubble"><b>${en}</b><small>${cn}</small></div>${reply?'<span class="speaker-avatar">'+sketchIcon('bunny','小兔')+'</span>':''}</div>`;
 function paint(){
  const scene=scenes[step];
  document.querySelector('#stage').innerHTML=`<div class="center"><div class="eyebrow">OUR PICNIC CHAT</div><h1>和朋友一起，慢慢聊</h1><p>小兔来到野餐垫上了。替它选一个回答，Momo 会接着和它聊下去。</p><div class="dialogue-history">${history.join('')}</div>${scene?`<div id="dialogue-question">${bubble(scene.q,scene.cn)}</div><h3 class="reply-heading">${sketchIcon('bunny')} 小兔想怎么回答？</h3><div class="reply-options">${scene.options.map((o,i)=>`<button class="reply-card" ${pending&&pending.i!==i?'disabled':''} onclick="chooseReply(${i})"><span>${sketchIcon(o[0])}</span><b>${o[1]}</b><small>${o[2]}　♫</small></button>`).join('')}</div><div id="dialogue-response" aria-live="polite"></div><div class="scene-controls"><button onclick="playDialogue()">♫ ${pending?'继续对话':'再听问题'}</button><button class="helper-button" onclick="dialogueDemo()">${sketchIcon('momo')} 帮我回答</button><button onclick="pauseDialogue()">暂停声音</button><button onclick="skipDialogue()">先聊下一个话题 →</button></div>`:'<p>阳光暖暖的，小伙伴们聊完啦。一起把野餐篮收拾好吧。</p><button class="primary" onclick="openChapter(2)">一起去装篮子 →</button><button onclick="openChapter(1)">再聊一次</button>'}<p id="message" aria-live="polite">${scene?'听听 Momo 说什么，再选一张图卡回答。':'谢谢你陪 Momo 聊天。'}</p></div>`;
  const transcript=document.querySelector('.dialogue-history');if(transcript)transcript.scrollTop=transcript.scrollHeight;
 }
 window.pauseDialogue=()=>{run++;stop();answering=false;document.querySelector('#dialogue-question')?.classList.remove('speaking');message('已暂停，点“'+(pending?'继续对话':'再听问题')+'”就能接着聊。')};
 window.playDialogue=async()=>{
  if(!valid()||step>=scenes.length)return;
  if(pending)return window.chooseReply(pending.i,pending.demo);
  const myRun=++run;answering=false;
  const question=document.querySelector('#dialogue-question');question.classList.add('speaking');
  const tokenBefore=step;const ok=await speak(scenes[step].q);
  if(!valid()||myRun!==run||step!==tokenBefore)return;
  question.classList.remove('speaking');
  if(ok)message('轮到你啦！选一个回答，继续和 Momo 聊天。');
 };
 window.chooseReply=async(i,demo=false)=>{
  if(!valid()||answering||step>=scenes.length)return;
  const scene=scenes[step],o=scene.options[i];if(!o)return;
  const choice=pending||{i,demo,recorded:false};
  if(choice.i!==i)return;
  pending=choice;answering=true;const myRun=++run;
  stop();document.querySelector('#dialogue-question').classList.remove('speaking');
  document.querySelectorAll('.reply-card').forEach(b=>b.disabled=true);
  document.querySelector('#dialogue-response').innerHTML=bubble(o[1],o[2],true);
  message('小兔正在回答，Momo 会接着聊下去。');
  if(!choice.recorded){await record('choice',{word:WORDS[step].id,mode:'dialogue_reply',reply_index:i,reply:o[1],hinted:demo,source:'practice'});choice.recorded=true}
  if(!valid()||myRun!==run)return;
  async function play(text){const promise=speak(text),token=speechToken;const ok=await promise;return ok&&token===speechToken&&valid()&&myRun===run}
  let ok=await play(o[1]);
  if(ok){document.querySelector('#dialogue-response').insertAdjacentHTML('beforeend',bubble(o[3],o[4]));ok=await play(o[3])}
  if(!valid()||myRun!==run)return;
  answering=false;
  if(!ok){paint();message('声音暂停了，点“继续对话”重听这次回答，也可以先聊下一个话题。');return}
  history.push(bubble(scene.q,scene.cn),bubble(o[1],o[2],true),bubble(o[3],o[4]));
  pending=null;step++;paint();
  if(step<scenes.length)window.playDialogue();
 };
 window.dialogueDemo=()=>window.chooseReply(pending?pending.i:0,true);
 window.skipDialogue=()=>{if(!valid()||step>=scenes.length)return;run++;stop();history.push(bubble(scenes[step].q,scenes[step].cn));pending=null;answering=false;step++;paint();if(step<scenes.length)window.playDialogue()};
 paint();window.playDialogue();
}

function story(){
 const w=WORDS[step];
 const scenes=[
  ['准备出发','Hello! I am Momo. Let us go! Look! An apple. A red apple.','你好！我是 Momo。我们出发吧！看，一个苹果。一个红苹果。'],
  ['带上香蕉','Hello, Bunny! Look! A banana. A yellow banana. In the basket!','你好，小兔！看，一根香蕉。一根黄香蕉。放进篮子里！'],
  ['分享面包','Here is our picnic. Look! Some bread. Yummy bread! Let us share.','这是我们的野餐。看，一些面包。好吃的面包！我们一起分享吧。'],
  ['野餐开始啦','Look! Some milk. Milk for you. Milk for me. Thank you!','看，一些牛奶。给你牛奶。也给我牛奶。谢谢！']
 ];
 const s=scenes[step],sceneStep=step;let myRun=0;
 document.querySelector('#stage').innerHTML=`<div class="scene-layout">${storyArt(w)}<div><div class="eyebrow">STORY · ${step+1} / 4</div><h1>${s[0]}</h1><p class="english-story">${s[1]}</p><details class="translation"><summary>看看中文意思</summary><p>${s[2]}</p><button onclick="speak('${s[2]}','zh-CN')">♫ 听中文释义</button></details><div class="cards"><button class="primary" onclick="playStory()">♫ 听英语故事</button><button onclick="hearWord('${w.id}')">♫ ${w.id}</button><button onclick="stop()">暂停声音</button></div><p id="message">点击食物可单独听英文单词。</p>${controls(step===3?'去和朋友说说话 →':'下一幕 →')}</div></div>`;
 window.playStory=async()=>{
  const run=++myRun;const playback=speak(s[1]);const token=speechToken;
  if(await playback && token===speechToken&&run===myRun&&screen==='theme'&&chapter===0&&step===sceneStep){
   await record('choice',{word:w.id,mode:'story_listen',source:'theme_exposure'});
   if(screen==='theme'&&chapter===0&&step===sceneStep)message('故事听完啦，可以点食物再听听，也可以继续。');
  }
 };
}
