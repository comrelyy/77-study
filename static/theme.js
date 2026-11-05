const SKETCH_ICONS={'🍎':'apple','🍌':'banana','🍞':'bread','🥛':'milk','🧺':'basket','🐻':'momo','🐰':'bunny','👋':'wave','💧':'water','☁️':'cloud'};
function sketchIcon(key,alt='',extra=''){return '<img class="sketch-icon '+extra+'" src="illustrations/'+(SKETCH_ICONS[key]||key)+'.svg" alt="'+alt+'" draggable="false">'}
function storyArt(w){return '<div class="story-art sketch-story scene-'+step+'"><div class="sketch-page-number">0'+(step+1)+' / MOMO’S PICTURE BOOK</div><img class="story-landscape" src="picnic-sketch.svg" alt="Momo 和小兔在草地上准备野餐"><div class="story-art-caption">'+['带上苹果，出发啦','小兔带来了弯弯的香蕉','好吃的面包，一起分享','给你牛奶，也给我牛奶'][step]+'</div><button class="food-prop sketch-food-prop" onclick="hearWord(&quot;'+w.id+'&quot;)" aria-label="听'+w.cn+'">'+sketchIcon(w.id,'')+'<small>♫ '+w.id+'</small></button></div>'}
const app=document.querySelector('#app');
const WORDS=[{id:'apple',cn:'苹果',icon:'🍎'},{id:'banana',cn:'香蕉',icon:'🍌'},{id:'bread',cn:'面包',icon:'🍞'},{id:'milk',cn:'牛奶',icon:'🥛'}];
const CHAPTERS=['主题小故事','情景对话','游戏互动','单词汇总'];
let state,screen='home',chapter=0,step=0,played=false,working=false,tries=0,selected=[],completed=false;
let speechToken=0,speechResolve=null,currentAudio=null,currentUtterance=null;
let session=Number(sessionStorage.getItem('picnicSeconds')||0),last=Date.now(),clockBusy=false;
function stop(){speechToken++;if(speechResolve){speechResolve(false);speechResolve=null}if(currentAudio){currentAudio.pause();currentAudio=null}if('speechSynthesis'in window)speechSynthesis.cancel();currentUtterance=null}
async function api(path,data){const r=await fetch('/api/'+path,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});if(!r.ok)throw Error('保存失败');return r.json()}
async function record(kind,payload){try{await api('event',{id:crypto.randomUUID(),kind,payload:{theme:'picnic',chapter:CHAPTERS[chapter],...payload}})}catch(e){stop();screen='error';app.innerHTML='<h1>先休息一下</h1><p>记录没有保存成功，请检查服务和本机存储。</p>';throw e}}
function message(text){const el=document.querySelector('#message');if(el)el.textContent=text}
async function speak(text,lang='en-US',file=null){
 stop();const token=speechToken;
 return new Promise(resolve=>{
  let done=false,fallback=false;const finish=ok=>{if(done)return;done=true;if(speechResolve===finish)speechResolve=null;resolve(ok&&token===speechToken)};speechResolve=finish;
  async function synth(){
   if(fallback||token!==speechToken)return;fallback=true;
   if(!('speechSynthesis'in window)){message('设备不支持语音，请使用支持语音的浏览器。');return finish(false)}
   let voices=speechSynthesis.getVoices();if(!voices.length){await new Promise(r=>setTimeout(r,500));voices=speechSynthesis.getVoices()}
   if(token!==speechToken)return finish(false);
   const prefix=lang.split('-')[0];const voice=voices.find(v=>v.localService&&v.lang.startsWith(prefix))||voices.find(v=>v.lang.startsWith(prefix));
   if(!voice){message('未找到'+(prefix==='en'?'英语':'中文')+'语音，请安装对应系统语音后重试。');return finish(false)}
   currentUtterance=new SpeechSynthesisUtterance(text);currentUtterance.voice=voice;currentUtterance.lang=lang;currentUtterance.rate=.85;
   currentUtterance.onend=()=>finish(true);currentUtterance.onerror=()=>{if(token===speechToken)message('声音播放失败，请检查音量后重试。');finish(false)};
   speechSynthesis.resume();speechSynthesis.speak(currentUtterance);
  }
  if(file){currentAudio=new Audio('audio/'+file+'.wav');currentAudio.onended=()=>finish(true);currentAudio.onerror=synth;currentAudio.play().catch(synth)}else synth();
 });
}
function allowed(){return state.seconds<900&&session<480}
function openChapter(n){stop();if(!allowed()){screen='rest';app.innerHTML='<h1>休息一下吧</h1><p>单次最多 8 分钟，每日最多 15 分钟。</p><button onclick="home()">返回首页</button>';return}chapter=n;step=0;screen='theme';last=Date.now();render()}
function home(){stop();screen='home';app.innerHTML=`<section class="hero"><div><div class="eyebrow">MOMO'S PICNIC DAY · 野餐食物</div><h1>带上好吃的，<br>和 Momo 去野餐。</h1><p>一个主题，三种玩法。<br>认识苹果、香蕉、面包和牛奶，一起出发吧。</p><button class="primary" onclick="openChapter(0)">▶ 开始野餐小故事</button></div><div class="picnic-scene"><img class="picnic-illustration" src="picnic-sketch.svg" alt="手绘的 Momo 小熊和兔子在草地上分享苹果、牛奶和一篮野餐食物"><span class="scene-caption">今天，也是适合野餐的一天 ♡</span></div></section><div class="cards">${CHAPTERS.map((c,i)=>`<button class="activity" onclick="openChapter(${i})"><small>0${i+1}</small><b>${c}</b><small>${['跟着 Momo 装好野餐篮','和小伙伴说说话','听声音，把食物装进篮子','再听一遍今天的主题词'][i]} →</small></button>`).join('')}</div><p>每个环节都可以单独进入，也可以跳过或随时结束。不要求记住全部单词。</p>`}
function shell(){return `<div class="toolbar"><span class="theme-label">${sketchIcon('basket')} 和 Momo 去野餐</span><button onclick="endTheme()">结束 · 再见啦</button></div><nav class="chapter-nav">${CHAPTERS.map((c,i)=>`<button class="${chapter===i?'active':''}" onclick="openChapter(${i})">${i+1}. ${c}</button>`).join('')}</nav>`}
function render(){stop();played=false;working=false;tries=0;selected=[];completed=false;app.innerHTML=shell()+'<section id="stage"></section>';if(chapter===0)story();if(chapter===1)dialogue();if(chapter===2)game();if(chapter===3)summary()}
function next(){if(working)return;if(step<3){step++;render()}else if(chapter<3)openChapter(chapter+1)}
function controls(nextLabel){return `<div class="scene-controls"><button onclick="next()">${nextLabel||'下一幕 →'}</button><button onclick="next()">跳过这一幕</button></div>`}
function story(){const w=WORDS[step];const scenes=[['准备出发','早上，Momo 准备去草地野餐。它发现了一颗苹果，想把它放进篮子。','An apple!'],['带上香蕉','小兔也想一起去。它带来一根香蕉，弯弯的，像一个小月亮。','A banana!'],['分享面包','走到大树下，Momo 铺好野餐垫。它拿出面包，准备和朋友分享。','Some bread!'],['野餐开始啦','小伙伴们坐好了。Momo 拿出牛奶，大家一起享受午后时光。','Some milk!']];const s=scenes[step];document.querySelector('#stage').innerHTML=`<div class="scene-layout">${storyArt(w)}<div><div class="eyebrow">STORY · ${step+1} / 4</div><h1>${s[0]}</h1><p class="narration">${s[1]}</p><div class="english-line">${s[2]}</div><div class="cards"><button class="primary" onclick="speak('${s[1]}','zh-CN')">♫ 听故事</button><button onclick="hearWord('${w.id}')">♫ ${w.id}</button></div><p id="message">点食物也可以听英文。</p>${controls(step===3?'去和朋友说说话 →':'下一幕 →')}</div></div>`}
async function hearWord(id){const w=WORDS.find(w=>w.id===id);if(await speak(w.id,'en-US',w.id))await record('introduced',{word:id,source:'theme_exposure'})}
function dialogue(){const w=WORDS[step];const lines=[['Would you like an apple?','你想要一个苹果吗？','Yes, please!','好的，谢谢！'],['A banana, please.','请给我一根香蕉。','Here you are.','给你。'],['Let’s share the bread.','我们一起分享面包吧。','Thank you!','谢谢你！'],['Some milk?','来点牛奶吗？','Yes, please!','好的，谢谢！']][step];document.querySelector('#stage').innerHTML=`<div class="center"><div class="eyebrow">LET'S TALK · ${step+1} / 4</div><h1>野餐垫上的小对话</h1><p>Momo 和小兔会自动说话，点击气泡也可以重听。</p><div class="conversation"><span class="speaker-avatar">🐻</span><button class="speech-bubble" onclick="hearLine(0)"><b>${lines[0]}</b><small>${lines[1]}　♫</small></button></div><div class="conversation reply"><button class="speech-bubble" onclick="hearLine(1)"><b>${lines[2]}</b><small>${lines[3]}　♫</small></button><span class="speaker-avatar">🐰</span></div><button class="food-mini" onclick="hearWord('${w.id}')">${w.icon}　${w.id} ♫</button><button onclick="playDialogue()">♫ 重播整段对话</button><button onclick="stop();message('已暂停，点击气泡或重播即可继续。')">暂停声音</button><p id="message">正在准备对话，无需开启麦克风。</p>${controls(step===3?'去玩装篮子游戏 →':'下一段对话 →')}</div>`;window.hearLine=async n=>{
 const bubbles=document.querySelectorAll('.speech-bubble');
 bubbles.forEach(b=>b.classList.remove('speaking'));
 const result=speak(lines[n===0?0:2]);const token=speechToken;
 bubbles[n]?.classList.add('speaking');
 const ok=await result;
 if(token!==speechToken)return false;
 bubbles[n]?.classList.remove('speaking');
 if(ok)await record('choice',{word:w.id,mode:'dialogue_listen',line:n,source:'practice'});
 return ok&&token===speechToken;
};
window.playDialogue=async()=>{
 const first=window.hearLine(0);const token=speechToken;
 if(await first && token===speechToken && screen==='theme' && chapter===1){
  if(await window.hearLine(1))message('对话听完啦，可以点气泡重听。');
 }
};
window.playDialogue();
}
function game(){const w=WORDS[step];const options=[...WORDS].sort(()=>Math.random()-.5);document.querySelector('#stage').innerHTML=`<div class="center"><div class="eyebrow">PACK THE BASKET · ${step+1} / 4</div><h1>帮 Momo 装好野餐篮</h1><p>听听 Momo 想带什么，再点食物放入篮子。</p><button class="primary" onclick="gamePrompt()">♫ 听听要找什么</button><div class="food-options">${options.map(x=>`<button class="food-tile" data-word="${x.id}" onclick="pickFood('${x.id}')" aria-label="${x.cn}"><span>${sketchIcon(x.id)}</span></button>`).join('')}</div><div class="game-basket" id="basket" aria-live="polite">${sketchIcon('basket','野餐篮')}</div><p id="message">先点喇叭听一听。</p><button class="helper-button" onclick="gameHelp()">${sketchIcon('momo')} Momo 帮帮忙</button>${controls(step===3?'看看今天的单词 →':'先跳过，找下一个 →')}</div>`}
async function gamePrompt(){if(working||completed)return;played=false;const current=step;if(await speak(WORDS[step].id,'en-US',WORDS[step].id)){if(screen==='theme'&&chapter===2&&step===current){played=true;message('听完啦，点一个食物放进篮子。')}}}
async function gameHelp(){if(working||completed)return;selected.push('help');await gamePrompt();document.querySelector(`[data-word="${WORDS[step].id}"]`)?.classList.add('highlight');message('Momo 找到了这个，一起放进篮子吧。')}
async function pickFood(id){if(working||completed)return;if(!played){message('先点喇叭，听听 Momo 想带什么。');return}working=true;tries++;const correct=id===WORDS[step].id;const current=step;await record('choice',{word:WORDS[step].id,chosen:id,correct,attempt:tries,hinted:selected.includes('help'),mode:'packing_game',source:'practice'});if(screen!=='theme'||chapter!==2||step!==current)return;working=false;if(correct){completed=true;document.querySelector('#basket').innerHTML=sketchIcon(id,WORDS[step].cn)+sketchIcon('basket','已装入野餐篮');document.querySelectorAll('.food-tile').forEach(b=>b.disabled=true);message('放进篮子啦！谢谢你帮 Momo。');document.querySelector('.scene-controls').innerHTML=`<button class="primary" onclick="next()">${step===3?'看看主题单词 →':'继续装篮子 →'}</button>`}else{message('这也是野餐食物。我们再听听 Momo 想带什么，也可以请 Momo 帮忙。');played=false}}
function summary(){document.querySelector('#stage').innerHTML=`<div class="center"><div class="eyebrow">OUR PICNIC WORDS</div><h1>野餐里的四个小伙伴</h1><p>点卡片再听一遍。听过和玩过都是参与，不代表已经掌握。</p><div class="word-grid">${WORDS.map(w=>`<button class="word-card" onclick="hearWord('${w.id}')"><span>${sketchIcon(w.id)}</span><b>${w.id} ♫</b><small>${w.cn}</small></button>`).join('')}</div><p id="message">随时可以回来再听。</p><button class="primary" onclick="endTheme()">和 Momo 说再见</button></div>`}
async function endTheme(reason='user'){if(screen==='end')return;stop();screen='end';await record('end',{reason});session=0;sessionStorage.setItem('picnicSeconds',session);app.innerHTML='<div class="center"><div class="eyebrow">SEE YOU NEXT TIME</div><h1>谢谢你，一起去野餐。</h1><div class="sticker">'+sketchIcon('basket','野餐纪念')+'</div><p>已经保存这次参与记录。下次可以从喜欢的环节开始。</p><button onclick="home()">返回首页</button></div>'}
async function records(){stop();screen='records';state=await api('state');const events=state.events.filter(e=>e.payload.theme==='picnic'&&e.kind!=='sticker');app.innerHTML='<div class="toolbar"><h1>野餐体验记录</h1><button onclick="home()">返回首页</button></div><p>这里记录听过的词和参与过程；故事、对话、游戏均不作为独立识别测试。</p>'+ (events.length?events.map(e=>{const p=Object.fromEntries(Object.entries(e.payload).map(([k,v])=>[k,typeof v==='string'?escapeText(v):v]));return `<div class="row"><small>${e.day} · ${p.chapter}</small><h3>${e.kind==='end'?'结束体验':e.kind==='introduced'?p.word+' · 完整听过':p.mode==='dialogue_reply'?p.word+' · 对话选择（'+p.reply+'）':p.mode==='story_listen'?p.word+' · 听过英语故事':p.mode==='dialogue_listen'?p.word+' · 听过对话':p.word+' · 游戏互动'}</h3>${p.mode==='packing_game'?`<p>第 ${p.attempt} 次选择 · ${p.correct?'放入目标食物':'选择其他食物'} · ${p.hinted?'Momo 帮助后':'未请求应用提示'} · 选择来源未核实</p>`:''}</div>`}).join(''):'<p>还没有记录，可以先去听个故事。</p>')}
function escapeText(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function stickers(){
 stop();screen='stickers';
 try{
  state=await api('state');
  if(screen!=='stickers')return;
  const earned=state.events.some(e=>e.kind==='sticker'&&e.payload.theme==='picnic');
  app.innerHTML='<div class="center"><h1>我们的小小纪念</h1><div class="sticker">'+sketchIcon(earned?'basket':'cloud',earned?'野餐纪念':'等待收集')+'</div><p>'+(earned?'野餐相伴 · 已收藏。提前结束也会保留，不重复发放。':'还没有野餐贴纸。听完一个词或参与一次互动，就会留下纪念。')+'</p><button onclick="home()">返回首页</button></div>';
 }catch(e){app.innerHTML='<h1>暂时无法读取贴纸</h1><p>请检查本地服务后重试。</p><button onclick="stickers()">重试</button>'}
}
document.querySelector('#records').onclick=records;
document.addEventListener('visibilitychange',()=>{last=Date.now();if(document.hidden)stop()});
setInterval(async()=>{const now=Date.now(),seconds=Math.min(5,(now-last)/1000);last=now;if(document.hidden||screen!=='theme'||clockBusy)return;session+=seconds;sessionStorage.setItem('picnicSeconds',session);state.seconds+=seconds;clockBusy=true;try{await api('tick',{seconds});if(!allowed()){stop();await endTheme(state.seconds>=900?'daily_limit':'session_limit')}}catch(e){stop();screen='error';app.innerHTML='<h1>记录保存遇到了问题，请先休息。</h1>'}finally{clockBusy=false}},1000);
api('state').then(s=>{state=s;home()}).catch(()=>app.textContent='无法连接本地 Python 服务，请先启动 start.cmd。');


