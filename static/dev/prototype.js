'use strict';
const {validate,Session}=MomoPrototype;
function el(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function button(label,action,className){const e=el('button',label,className);e.type='button';e.addEventListener('click',action);return e;}
const player=new MomoAudio.Player({fallback:(text,done)=>{
  if(!('speechSynthesis'in window)){done(false);return ()=>{};}
  const u=new SpeechSynthesisUtterance(text);u.lang='en-US';u.rate=.8;
  const voice=speechSynthesis.getVoices().find(v=>v.lang.startsWith('en'));if(voice)u.voice=voice;
  u.onend=()=>done(true);u.onerror=()=>done(false);speechSynthesis.speak(u);
  return ()=>speechSynthesis.cancel();
}});
function stopSound(){player.stop();}
function say(text,path){return player.play(path?'../'+path:null,text,{allowFallback:true});}
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopSound();});
window.addEventListener('pagehide',stopSound);
function mount(pack){
  const section=el('section',undefined,'prototype-panel'),title=el('h2',pack.title),nav=el('nav'),body=el('div'),debug=el('details'),debugText=el('pre');
  const label=el('label',undefined,'failure-toggle'),fail=el('input');fail.type='checkbox';label.append(fail,el('span','让下一次保存失败（仅本地演练）'));
  debug.append(el('summary','开发演练 · 本页记录'),label,debugText);
  section.append(title,el('p',pack.sceneId==='tidy'?'内部整理样例 · 未发布':'野餐结构样例 · 未接入正式入口'),nav,body,debug);document.querySelector('#panels').append(section);
  const saved=new Map();let storyIndex=0,fragment=0,summaryPage=0,view='dialogue',uiGeneration=0;
  const session=new Session(pack,{save:async event=>{
    await new Promise(resolve=>setTimeout(resolve,250));
    if(fail.checked){fail.checked=false;throw Error('simulated failure');}
    const snapshot=JSON.stringify(event);if(saved.has(event.operationId)&&saved.get(event.operationId)!==snapshot)throw Error('operation ID conflict');saved.set(event.operationId,snapshot);debugText.textContent=JSON.stringify([...saved.values()].map(JSON.parse),null,2);
  }});
  function image(id){const asset=pack.assets.find(a=>a.id===id);const img=el('img',undefined,'sketch-icon');img.src='../'+asset.path;img.alt='';img.draggable=false;return img;}
  function word(id){return pack.words.find(w=>w.id===id);}
  function audioPath(id){return pack.assets.find(a=>a.id===id&&a.kind==='audio')?.path;}
  function switchView(module){stopSound();uiGeneration++;view=module;storyIndex=0;fragment=0;session.enter(module==='game'?'game':'dialogue');render();}
  for(const [id,label]of [['story','小故事'],['dialogue','说说话'],['game','玩游戏'],['summary','听单词']]){const b=button(label,()=>switchView(id));b.dataset.module=id;nav.append(b);}
  function render(){
    uiGeneration++;const generation=uiGeneration;body.replaceChildren();nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.module===view));
    const message=el('div','', 'prototype-message');message.setAttribute('role','status');
    const actions=el('div',undefined,'prototype-actions');
    const tell=text=>{if(generation===uiGeneration)message.textContent=text;};
    async function play(text,audioId){tell('正在播放，随时可以暂停或结束。');const ok=await say(text,audioPath(audioId));if(generation!==uiGeneration)return false;tell(ok?(player.source==='local-file'?'本地文件听完啦。':'开发回退语音听完啦；此项不算本地样音验收。'):'声音已暂停或不可用，可以重听、看图或结束。');return ok;}
    async function playSegments(segments){for(const s of segments)if(!await play(s.text,s.audio))return false;return true;}
    const pause=button('暂停声音',()=>{stopSound();tell('已暂停。点击重听可从当前短片段继续。');});actions.append(pause);
    if(view==='story'){
      const s=pack.modules.story[storyIndex],scene=el('div',undefined,'prototype-scene '+pack.sceneId);scene.append(image(s.characters[0]));
      const prop=button('',()=>play(word(s.mainWord).text,word(s.mainWord).audio));prop.setAttribute('aria-label','听'+word(s.mainWord).cn);prop.append(image(word(s.mainWord).image));scene.append(prop);
      body.append(el('h3',s.title),scene,el('p',s.segments[fragment].text,'english-story'));
      const translation=el('details');translation.append(el('summary','看看中文意思'),el('p',s.translation));body.append(translation);
      actions.prepend(button('听这一小段',()=>play(s.segments[fragment].text,s.segments[fragment].audio),'primary'));
      actions.append(button('下一小段',()=>{stopSound();if(fragment+1<s.segments.length){fragment++;render();}else tell('这一幕结束啦，可以重听或看下一幕。');}));
      if(storyIndex+1<pack.modules.story.length)actions.append(button('下一幕',()=>{stopSound();storyIndex++;fragment=0;render();}));
      else actions.append(button('看看其他玩法',()=>switchView('dialogue')));
      message.textContent='点食物可听单词。这里只演练短片段播放，不生成完整幕参与记录。';
    }else if(view==='summary'){
      const grid=el('div',undefined,'word-grid');for(const id of pack.modules.summary.slice(summaryPage*4,summaryPage*4+4)){const w=word(id),b=button('',()=>play(w.text,w.audio),'word-card');b.append(image(w.image),el('b',w.text+' ♫'),el('small',w.cn));grid.append(b);}body.append(el('h3','今天的小伙伴'),grid);
      if(pack.modules.summary.length>4)actions.append(button('换一页',()=>{stopSound();summaryPage=(summaryPage+1)%Math.ceil(pack.modules.summary.length/4);render();}));
      message.textContent='点卡片听一听，不要求点完。此原型不保存词音参与记录。';
    }else{
      const isDialogue=view==='dialogue',step=isDialogue?pack.modules.dialogue[session.index]:pack.modules.game.questions[session.index];
      if(isDialogue){
        body.append(el('h3','替小兔选一个回答'),image(pack.sceneId+'.momo'));
        const bubble=el('div',undefined,'speech-bubble');bubble.append(el('b',step.question.map(s=>s.text).join(' ')));body.append(bubble);
        actions.prepend(button('听听问题',()=>playSegments(step.question)));
      }else{
        body.append(el('h3',pack.modules.game.type==='listen-pack'?'听一听，装进野餐篮':'先选玩具，再点它的家'));
        if(pack.modules.game.type==='listen-pack')actions.prepend(button('听听要找什么',async()=>{session.heard=false;const ok=await play(word(step.target).text,word(step.target).audio);if(generation===uiGeneration){session.heard=ok;render();body.querySelector('[role=status]').textContent=ok?'听完啦，选食物再装进篮子。声音来源：'+(player.source==='local-file'?'本地文件':'开发回退语音'):'先恢复声音，才能装篮子。';}},'primary'));
      }
      const options=el('div',undefined,'reply-options');
      const choices=isDialogue?step.options:session.candidates().map(id=>({...word(id),cn:'',text:word(id).cn}));
      for(const o of choices){const b=button('',async()=>{
        if(!isDialogue&&pack.modules.game.type==='listen-pack'){
          if(!session.heard){tell('先完整听完要找的词，再点食物放进篮子。现在不会记录答案。');return;}
          if(session.select(o.id))await submit();return;
        }
        if(!session.select(o.id))return;stopSound();render();if(isDialogue){const current=uiGeneration;const ok=await say(o.text,audioPath(o.audio));if(current===uiGeneration)body.querySelector('[role=status]').textContent=ok?'试听结束（'+(player.source==='local-file'?'本地文件':'开发回退语音')+'）。点“就这样回答”才会提交。':'声音暂停或不可用；仍可看图选择，也可以结束。';}
      },'reply-card');b.disabled=session.busy||session.failed||session.done;b.setAttribute('aria-pressed',String(session.selection===o.id));if(session.selection===o.id)b.classList.add('chosen');b.append(image(o.image));const text=el('div');text.append(el('b',o.text));if(o.cn)text.append(el('small',o.cn));if(session.selection===o.id)text.append(el('small',!isDialogue&&pack.modules.game.type==='listen-pack'?'✓ Momo 示范的食物':'✓ 已选中，等待确认','selected-mark'));b.append(text);options.append(b);}body.append(options);
      async function submit(zone){stopSound();const pending=session.confirm(zone);render();const ok=await pending;if(generation+1===uiGeneration){render();const msg=body.querySelector('[role=status]');if(ok)msg.textContent=isDialogue?'回答已确认（本页演练）。可以主动重听接话或看下一轮。':session.done?'放好了，谢谢你！':'还没放好，可以再选一个。';}}
      if(!session.failed&&!session.done){
        if(isDialogue){const confirm=button('就这样回答',()=>submit(),'primary');confirm.disabled=!session.selection||session.busy;actions.prepend(confirm);}
        else if(pack.modules.game.type==='select-place')for(const zone of pack.modules.game.zones){const b=button('放到'+zone.label,()=>submit(zone.id));b.disabled=!session.selection||session.busy;actions.prepend(b);}
      }
      if(isDialogue&&!session.done){const demo=button('示范回答',()=>{stopSound();if(session.select(step.options[0].id,{demo:true}))render();});demo.disabled=session.busy||session.failed;actions.append(demo);}
      if(!isDialogue&&!session.done){
        actions.append(button('看看怎么玩',()=>{if(!session.help('instructions'))return;stopSound();tell(pack.modules.game.type==='listen-pack'?'先听完要找的词，再点一张食物卡放进篮子。也可以跳过或结束。':'先点一件玩具，再点一个收纳区。可以先换选，不需要拖动。也可以跳过或结束。');}));
        if(pack.modules.game.type==='listen-pack')actions.append(button('再听一次',async()=>{if(!session.help('repeat'))return;session.heard=false;const ok=await play(word(step.target).text,word(step.target).audio);if(generation===uiGeneration){session.heard=ok;render();}}));
        actions.append(button('Momo 示范',()=>{if(!session.help('demo'))return;stopSound();render();const target=pack.modules.game.type==='select-place'?pack.modules.game.zones.find(z=>z.id===step.zone).label:'野餐篮';body.querySelector('[role=status]').textContent='Momo 选好了'+word(step.target).cn+'，它要去'+target+'。'+(pack.modules.game.type==='select-place'?'再点收纳区才提交。':'听完要找的词后，再点食物才提交。')+'这题后续尝试会记作使用过示范。';}));
      }
      if(session.done&&isDialogue){const event=session.events.at(-1),choice=step.options.find(o=>o.id===event?.selectedId);if(choice)actions.append(button('听听 Momo 的接话',()=>playSegments(choice.followUp)));}
      if(!session.busy&&!session.failed)actions.append(button(session.done?'下一轮':'先跳过',()=>{stopSound();if(session.next())render();else{body.replaceChildren(el('h3','这一段结束啦'),button('再玩一次',()=>switchView(view)),button('看看其他玩法',()=>switchView('summary')));}}));
      if(session.failed){const retry=button('重试这次保存',async()=>{const current=session.generation;const pending=session.retry();render();await pending;if(current===session.generation&&view!=='end')render();});retry.dataset.retry='true';actions.prepend(retry);}
      message.textContent=session.failed?'请大人帮一下。这次保存失败了，可以同一编号重试，或直接结束。':session.busy?'正在保存这次选择……':session.done?'已确认。不会自动进入下一轮或下一模块。':isDialogue?'卡片只预选和试听，确认后才产生本页演练记录。':pack.modules.game.type==='listen-pack'?'先完整听目标词，再选择食物。':'选择玩具后，再点一个收纳区确认。';
    }
    if(session.busy||session.failed)actions.querySelectorAll('button').forEach(b=>{if(b!==pause&&!(session.failed&&!session.busy&&b.dataset.retry))b.disabled=true;});
    actions.append(button('结束这一段',()=>{stopSound();uiGeneration++;session.exit();view='end';body.replaceChildren(el('h3','谢谢你一起玩。'),el('p','原型已结束，没有写入家庭数据库。'),button('从头体验',()=>switchView('dialogue')));}));
    body.append(actions,message);
  }
  render();
}
Promise.all(['picnic','tidy'].map(async name=>{
  const response=await fetch('content/'+name+'.json');if(!response.ok)throw Error('内容读取失败');const pack=await response.json();const result=validate(pack);if(result.errors.length)throw Error(result.errors.join('\n'));return pack;
})).then(packs=>packs.forEach(mount)).catch(error=>{document.querySelector('#error').textContent='无法加载开发样例：'+error.message;});
