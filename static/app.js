const app=document.querySelector('#app');let state,screen='home',busy=false,variant='ball',attempt=0,hinted=false,ready=false,session=Number(sessionStorage.getItem('momoSeconds')||0),last=Date.now(),ending=false;
const uid=()=>crypto.randomUUID();
async function api(path,data){let r=await fetch('/api/'+path,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});let v=await r.json();if(!r.ok)throw Error(v.error);return v}
async function save(kind,payload={}){try{await api('event',{id:kind==='introduced'?'introduced-red':uid(),kind,payload});state=await api('state')}catch(e){stop();app.innerHTML='<h1>先休息一下</h1><p class="error">记录未能保存，请检查本机存储后重新打开。</p>';throw e}}
let audio, utterance, playbackId=0;
function stop(){
  playbackId++;
  if('speechSynthesis' in window)window.speechSynthesis.cancel();
  if(audio){audio.onended=null;audio.onerror=null;audio.pause();audio=null}
  utterance=null;busy=false;ready=false;
}
async function speak(name){
  stop();busy=true;ready=false;
  const token=playbackId;
  const message=text=>document.querySelector('#message')?.replaceChildren(text);
  return new Promise(resolve=>{
    let settled=false,fallbackStarted=false;
    function complete(ok){
      if(settled)return;settled=true;
      if(token!==playbackId){resolve(false);return}
      busy=false;ready=ok;resolve(ok);
    }
    async function deviceVoice(){
      if(fallbackStarted)return;fallbackStarted=true;
      if(token!==playbackId)return complete(false);
      if(!('speechSynthesis' in window)){message('设备不支持语音，请添加本地 audio/red.wav 文件。');return complete(false)}
      const synth=window.speechSynthesis;
      let voices=synth.getVoices();
      if(!voices.length){
        await new Promise(done=>{
          const changed=()=>{synth.removeEventListener('voiceschanged',changed);clearTimeout(timer);done()};
          const timer=setTimeout(changed,1000);synth.addEventListener('voiceschanged',changed);
        });
        voices=synth.getVoices();
      }
      if(token!==playbackId)return complete(false);
      const voice=voices.find(v=>v.localService&&/^en[-_]/i.test(v.lang))||voices.find(v=>/^en[-_]/i.test(v.lang));
      if(!voice){message('设备没有可用的英语语音。请安装系统英语语音，或添加本地 audio/red.wav 文件。');return complete(false)}
      utterance=new SpeechSynthesisUtterance('Red.');
      utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=.8;utterance.volume=1;
      utterance.onend=()=>{if(token===playbackId)message('可以再听一遍，也可以继续。');complete(true)};
      utterance.onerror=()=>{if(token===playbackId)message('语音播放失败，请检查设备音量和浏览器声音权限，再点击重听。');complete(false)};
      message('正在播放 Red…');synth.resume();synth.speak(utterance);
    }
    audio=new Audio('audio/'+name+'.wav');
    audio.onended=()=>complete(true);
    audio.onerror=()=>deviceVoice();
    audio.play().catch(()=>deviceVoice());
  });
}
const pic=(color,block=false)=>`<div class="shape ${block?'block':''}" style="--color:${color}"></div>`;
function allowed(){return state.seconds<900&&session<480}
function home(){stop();screen='home';app.innerHTML=`<section class="hero"><div><div class="eyebrow">A LITTLE MOMENT TOGETHER</div><h1>你好呀，<br>今天一起发现红色。</h1><p>和 Momo 听一听、找一找。<br>只看一张图片，也是一段美好的相伴。</p></div><div class="planet"><span class="star">✦</span><div class="momo">☁️</div></div></section><div class="cards"><button class="activity" onclick="start('listen')">♫<b>听一听</b><small>看看图片，听听它的声音 →</small></button><button class="activity" onclick="start('find')">◎<b>找一找</b><small>听见 Red，找一找红色 →</small></button><button class="activity" onclick="stickers()">✿<b>参与贴纸</b><small>收藏我们一起玩过的时刻 →</small></button></div><p>不用赶进度，随时可以结束。</p>`}
async function start(mode){if(!allowed()){app.innerHTML='<h1>现在是休息时间</h1><p>单次最多 8 分钟，每日最多 15 分钟。</p><button onclick="home()">返回首页</button>';return}ending=false;variant='ball';if(mode==='listen'||!state.events.some(e=>e.kind==='introduced'))listen(mode);else question()}
function bar(){return '<div class="toolbar"><span>✦ 红色小发现</span><button onclick="finish()">结束 · 再见啦</button></div>'}
async function listen(next='listen'){screen='listen';app.innerHTML=bar()+`<div class="center"><div class="eyebrow">一起听一听</div><h1>一个红色的新朋友</h1><div class="options"><div class="picture">${pic('#dc6558')}</div></div><p id="message">点击喇叭，听听它的声音。</p><div class="cards"><button class="primary" id="play">♫ 听一听</button><button onclick="question()">找一找 →</button></div></div>`;document.querySelector('#play').onclick=async()=>{if(await speak('red')){await save('introduced');document.querySelector('#message').textContent='已经一起听过啦。可以再听，也可以结束。'}}}
function question(){stop();screen='question';attempt=0;hinted=false;ready=false;const colors=Math.random()<.5?['#dc6558','#648cba']:['#648cba','#dc6558'];app.innerHTML=bar()+`<div class="center"><div class="eyebrow">听见声音，再选一张</div><h1>红色在哪里？</h1><p id="message">先点击喇叭听一听。</p><button class="primary" onclick="speak('red')">♫ 听 Red</button><div class="options">${colors.map(c=>`<button class="picture" onclick="choose('${c}')" aria-label="${c==='#dc6558'?'红色':'蓝色'}图片">${pic(c,variant==='block')}</button>`).join('')}</div><button onclick="hint()">☁ Momo 示范</button> <button onclick="skip()">跳过这一张 →</button></div>`}
async function choose(color){if(!ready||busy){document.querySelector('#message').textContent='先把声音听完，再选一张吧。';return}ready=false;attempt++;const correct=color==='#dc6558';await save('choice',{variant,attempt,correct,hinted,source:'unverified'});if(correct){document.querySelector('#message').textContent=attempt===1&&!hinted?'你找到它啦。':'我们一起找到它啦。';document.querySelector('.options').innerHTML=pic('#dc6558',variant==='block');document.querySelector('.center').insertAdjacentHTML('beforeend',variant==='ball'?'<div class="cards"><button onclick="variant=\'block\';question()">换成积木，再玩一下</button><button onclick="finish()">今天就到这里</button></div>':'<div class="cards"><button onclick="finish()">今天就到这里</button></div>')}else if(attempt>=2)hint();else{document.querySelector('#message').textContent='我们再听一遍，也可以请 Momo 示范。';await speak('red')}}
async function hint(){hinted=true;document.querySelector('.options').innerHTML=`<div class="picture">${pic('#dc6558',variant==='block')}</div>`;document.querySelector('#message').textContent='一起看看红色，听一听就好。';await speak('red');document.querySelector('.center').insertAdjacentHTML('beforeend','<div class="cards"><button onclick="finish()">结束，去休息</button></div>')}
async function skip(){await save('skip',{variant});finish()}
async function finish(){if(ending)return;ending=true;stop();screen='end';await save('end');app.innerHTML=`<div class="center"><div class="eyebrow">SEE YOU NEXT TIME</div><h1>今天就到这里啦。</h1><div class="sticker">${state.events.some(e=>e.kind==='sticker')?'🌺':'☁️'}</div><p>谢谢你和 Momo 一起玩。${state.events.some(e=>e.kind==='sticker')?'参与纪念已经保存。':''}</p><button onclick="home()">返回首页</button></div>`}
function stickers(){if(!allowed())return start();screen='stickers';app.innerHTML=bar()+`<div class="center"><h1>我们的小小纪念</h1><div class="sticker">${state.events.some(e=>e.kind==='sticker')?'🌺':'☁️'}</div><p>${state.events.some(e=>e.kind==='sticker')?'红色的相伴 · 已收藏':'听看或参与后，这里会留下小小纪念。'}</p></div>`}
async function records(){stop();screen='records';state=await api('state');const confirmations=new Map([...state.events].reverse().filter(e=>e.kind==='confirmation').map(e=>[e.payload.event,e.payload.value]));app.innerHTML=`<div class="toolbar"><h1>体验记录</h1><button onclick="home()">返回首页</button></div><p>今日已用 ${Math.floor(state.seconds/60)} 分钟。这些是图片任务记录，不评价整体英语能力。</p>`+state.events.filter(e=>!['sticker','confirmation'].includes(e.kind)).map(e=>`<div class="row"><small>${e.day} · ${new Date(e.created*1000).toLocaleTimeString()}</small><h3>${({introduced:'已一起听过 Red',choice:e.payload.correct?'匹配红色':'未匹配红色',skip:'跳过',end:'主动结束'})[e.kind]}</h3>${e.kind==='choice'?`<p>${e.payload.variant==='ball'?'球':'积木'} · 第 ${e.payload.attempt} 次选择 · ${e.payload.hinted?'有答案示范':'无应用答案提示'} · ${confirmations.get(e.id)||'选择来源未核实'}</p><button onclick="confirmChoice('${e.id}','孩子选择，无成人答案提示')">确认孩子选择</button> <button onclick="confirmChoice('${e.id}','成人代选或来源不确定')">成人代选／不确定</button>`:''}</div>`).join('')}
async function confirmChoice(event,value){await save('confirmation',{event,value});records()}
document.querySelector('#records').onclick=records;
setInterval(async()=>{const now=Date.now(),delta=Math.min(5,(now-last)/1000);last=now;if(document.hidden||!['listen','question','stickers'].includes(screen))return;session+=delta;sessionStorage.setItem('momoSeconds',session);try{await api('tick',{seconds:delta});state.seconds+=delta;if(session>=465||state.seconds>=885)finish()}catch(e){stop();app.innerHTML='<h1>记录保存遇到了问题，请先休息。</h1>'}},1000);
api('state').then(s=>{state=s;home()}).catch(()=>app.textContent='无法连接本地服务，请重新启动 Python 服务。');




