import {node,button,image,actions} from './dom.mjs?v=content-v2';
import {speedControls,observationForm} from './enhancements.mjs';
import {StoryState} from './story-state.mjs';
import {LessonState} from './lesson-state.mjs?v=segment-cn-20261109b';
import {MemoryStorage} from './store.mjs';
import {serializeProgress,restoreProgress} from './progress.mjs?v=lesson-20261110';
import {renderStory} from '../modules/story.mjs?v=segment-cn-20261109b';
import {renderDialogue} from '../modules/dialogue.mjs?v=integrated-20261103';
import {renderGame} from '../modules/game.mjs?v=segment-cn-20261109b';
import {renderSummary} from '../modules/summary.mjs';
import {renderLesson} from '../modules/lesson.mjs?v=segment-cn-20261109b';
import {pendingInteractionGame} from './interaction-flow.mjs?v=integrated-20261103';
const labels={story:'主题小故事',dialogue:'情景对话',game:'游戏互动',summary:'单词汇总',lesson:'这节课'};
const guides={story:'点“听英语故事”开始。暂停后可以继续当前小段；点图卡听单词。也可以跳过或结束。',dialogue:'点一个回答，小兔就会说出来，Momo 会接着说下一句。想先听听可以点示范回答。也可以暂停、跳过或结束。',summary:'点图卡听单词。可以重听，也可以随时结束，不用点完每一张。',lesson:'跟着进度条一步步来：听一听、答一答。答错了可以再试，随时可以暂停或结束。'};
export class App{
  constructor({root,pack,store,player,reviewLoader,scenes=[],navigateScene,Session=globalThis.MomoPrototype.Session,storage,uuid=()=>crypto.randomUUID(),now=()=>Date.now()}){
    storage=storage??(store.internal?new MemoryStorage():globalThis.sessionStorage);
    Object.assign(this,{root,pack,store,player,reviewLoader,scenes,navigateScene,Session,storage,uuid,now});this.generation=0;this.view='home';this.moduleId=null;this.states=new Map();this.seenGuides=new Set();this.daily=0;this.session=Number(storage?.getItem('picnicSeconds')||0);if(!Number.isFinite(this.session)||this.session<0)this.session=0;this.last=now();this.busy=false;this.pending=null;this.failure=null;this.data={events:[],seconds:0};this.tickBusy=false;this.ended=false;
  }
  async init(){this.availableReviewAssets=new Set();if(typeof fetch==='function')await Promise.all(this.pack.words.map(async w=>{for(const id of [w.audio,w.image]){const a=this.asset(id);try{const r=await fetch(a.path,{method:'HEAD'});if(r.ok)this.availableReviewAssets.add(a.path);}catch{}}}));this.data=await this.store.state();if(this.reviewLoader){const review=await this.reviewLoader(this.data.events);this.reviewPacks=review.packs;this.availableReviewAssets=review.available;}this.daily=this.data.seconds;this.applyState(this.data,true);if(this.data.pendingCount)this.failure={recover:true,code:this.data.recoveryError?.code,message:this.data.recoveryError?.message||'有上次记录待确认，请大人帮一下。'};if(this.store.persistent&&this.store.token)try{await this.store.release();}catch{}this.draw();if(this.data.recoveryMessage)this.message(this.data.recoveryMessage);if(this.data.recoveryError)this.scheduleRecovery(this.data.recoveryError);}
  scheduleRecovery(error){
    clearTimeout(this.recoveryTimer);
    if(error?.code!=='other_page_active'||!Number.isFinite(error.retryAfterMs)||this.store.retired)return;
    if(this.failure){this.failure.waitingForLease=!error.browserLive;this.draw();this.message(error.browserLive?'正在等待另一个页面结束活动，随后会自动重新连接。':'正在等待上一个活动释放，随后会自动重新连接。');}
    const failure=this.failure,generation=this.generation;
    this.recoveryTimer=setTimeout(()=>{if(this.failure===failure&&this.generation===generation&&!this.store.retired)this.retry();},Math.max(250,Math.min(12000,error.retryAfterMs+100)));
    this.recoveryTimer?.unref?.();
  }
  applyState(data,restore=false){
    if(data.pendingCount&&data.recoveryError)this.failure={recover:true,message:data.recoveryError.message,code:data.recoveryError.code};
    if(data.progressConflict)this.failure={recover:true,message:'已有较新的位置，旧位置没有覆盖它。请核对记录后主动继续。'};
    if(data.quota){this.quota=data.quota;this.daily=data.quota.dailyUsed;this.session=data.quota.segmentUsed;}
    if(restore&&Array.isArray(data.progress))for(const record of data.progress)if(record.sceneId===this.pack.sceneId&&labels[record.moduleId]){if(!record.compatible||!restoreProgress(this.pack,record.moduleId,this.stateFor(record.moduleId),record))this.states.delete(record.moduleId);}
    if(data.reminderId&&!this.reminderId){const storage=this.store.storage||this.storage;try{const key='momo.reminder.'+data.reminderId;if(!storage?.getItem(key)){storage?.setItem(key,'shown');this.reminderId=data.reminderId;this.message('这一小段快到这里啦，随时可以结束。');}}catch{this.reminderId=data.reminderId;}}
  }
  credit(result,seconds){if(result?.quota)this.applyState(result);else{this.daily+=seconds;this.session+=seconds;this.storage?.setItem('picnicSeconds',String(this.session));}}
  async checkpoint(module=this.moduleId){
    if(!this.store.persistent||!module||!this.states.has(module))return true;
    try{const result=await this.store.checkpoint(serializeProgress(this.pack,module,this.stateFor(module)));this.applyState(result);if(result?.progressConflict){this.pause();this.draw();return false;}return true;}
    catch(error){this.failure={recover:true,message:error.message,code:error.code};this.pause();this.draw();return false;}
  }
  asset(id){const a=this.pack.assets.find(x=>x.id===id);if(!a)throw Error('Missing asset '+id);return a;}
  word(id){const w=this.pack.words.find(x=>x.id===id);if(!w)throw Error('Missing word '+id);return w;}
  assetImage(id,alt=''){return image(this.asset(id).path,alt);}
  message(text){if(this.status)this.status.textContent=text;}
  pause(){this.player.stop();for(const s of this.states.values())if(s instanceof StoryState)s.pause();}
  allowed(){return this.quota?this.quota.allowed&&!this.quota.dateAnomaly:this.limitsEnabled===false||this.daily<900&&this.session<480;}
  home(){this.opening=(this.opening||0)+1;if(this.failure?.code==='other_page_active'&&!this.pending){try{if(!this.store.entries?.().length){clearTimeout(this.recoveryTimer);this.failure=null;}}catch{}}if(this.store.persistent){if(this.closingTask){this.pause();this.view='home';this.moduleId=null;this.draw();return this.closingTask;}return this.leavePersistent('home');}this.pause();this.view='home';this.moduleId=null;this.last=this.now();this.draw();}
  async selectScene(id){
    if(this.switchingScene||this.failure||this.pending||!this.navigateScene||(id!==null&&!this.scenes.some(scene=>scene.id===id))||id===this.pack.sceneId)return;
    this.switchingScene=true;this.opening=(this.opening||0)+1;
    try{
      if(this.saveTask)await this.saveTask.catch(()=>{});
      if(this.closingTask)await this.closingTask;
      if(this.leaving)await this.leaving;
      if(this.failure||this.pending)return;
      if(this.store.persistent)await this.leavePersistent('connecting');else{this.pause();this.generation++;}
      if(!this.failure&&!this.pending)await this.navigateScene(id);
    }catch(error){this.failure={recover:!!this.store.persistent,message:error.message};this.draw();}
    finally{this.switchingScene=false;}
  }
  memoryImage(){return this.pack.sceneId==='picnic'?'illustrations/basket.svg':this.asset(this.pack.words[0].image).path;}
  get integratedInteractions(){return Boolean(this.pack.interaction);}
  visibleModules(){if(this.pack.lesson)return [['lesson',labels.lesson]];return Object.entries(labels).filter(([id])=>id!=='lesson').filter(([id])=>id!=='game'||!this.integratedInteractions||this.pack.interaction.separateGameEntry);}
  moduleLabel(id){return id==='dialogue'&&this.integratedInteractions?'情景互动':labels[id];}
  leavePersistent(target='suspended'){
    if(this.leaving){this.view=target;if(target==='home')this.moduleId=null;this.draw();return this.leaving;}
    const task=this.leavePersistentTask(target);this.leaving=task;task.finally(()=>{if(this.leaving===task)this.leaving=null;}).catch(()=>{});return task;
  }
  async leavePersistentTask(target='suspended'){
    const leaseToken=this.store.token;
    const module=this.moduleId,active=['module','stickers'].includes(this.view),endedAt=this.now(),seconds=active?Math.max(0,Math.min(5,(endedAt-this.last)/1000)):0;
    this.pause();const checkpoint=active&&!this.pending&&!this.busy?this.checkpoint(module):Promise.resolve(true);
    let clock;try{clock=seconds?(this.store.queueFinalTick?this.store.queueFinalTick(seconds,endedAt):this.store.tick(seconds,endedAt)):null;}catch(error){clock=Promise.reject(error);}
    const settlement=clock?.then(result=>({result}),error=>({error}));
    this.view=target;if(target==='home')this.moduleId=null;this.last=endedAt;this.draw();
    try{if(this.clockTask)await this.clockTask.catch(()=>{});if(settlement){const {result,error}=await settlement;if(error)throw error;this.credit(result,seconds);}await checkpoint;await this.store.flush({keepalive:true});}
    catch(error){this.failure={recover:true,message:error.message,code:error.code};if(this.view===target)this.draw();}
    finally{try{await this.store.release(leaseToken);}catch{}}
  }
  suspend(){if(this.store.persistent&&['module','stickers'].includes(this.view))return this.leavePersistent('suspended');this.pause();}
  pageHide(){
    clearTimeout(this.recoveryTimer);this.pause();const now=this.now(),active=['module','stickers'].includes(this.view);
    const seconds=active?Math.max(0,Math.min(5,(now-this.last)/1000)):0,progress=[];
    if(active&&!this.pending&&!this.busy&&this.states.has(this.moduleId)){
      progress.push(serializeProgress(this.pack,this.moduleId,this.stateFor(this.moduleId)));
      if(this.moduleId==='dialogue'&&this.integratedInteractions&&this.states.has('game'))progress.push(serializeProgress(this.pack,'game',this.stateFor('game')));
      if(this.moduleId==='lesson'&&this.stateFor('lesson').step.kind==='game'&&this.states.has('game'))progress.push(serializeProgress(this.pack,'game',this.stateFor('game')));
    }
    this.last=now;this.view='suspended';this.generation++;
    this.store.retire?.(progress,seconds,now);
  }
  stateFor(id){
    if(!this.states.has(id)){
      if(id==='story')this.states.set(id,new StoryState(this.pack.modules.story));
      else if(id==='summary')this.states.set(id,{page:0});
      else if(id==='lesson')this.states.set(id,new LessonState(this.pack));
      else{const s=new this.Session(this.pack,{save:async event=>{
        const ok=await this.emit('choice',{...event,mode:id==='dialogue'?'dialogue_reply':({'listen-pack':'packing_game','select-place':'tidy_game','scene-find':'scene_find_game','story-order':'story_order_game'})[this.pack.modules.game.type],correct:event.matched,reply:event.text,attempt:event.attempt,hinted:event.hinted||event.source==='demo',...(id==='game'?{targetAudioCompleted:s.heard}:{})},event.operationId);
        if(!ok)throw Error('save pending');
      }});s.enter(id);s.speechIndex=0;this.states.set(id,s);}
    }
    const state=this.states.get(id);if(!state.practiceId)state.practiceId=this.uuid();return state;
  }
  open(id,restart=false){if(this.store.persistent)return this.openPersistent(id,restart);return this.openLocal(id,restart);}
  openLocal(id,restart=false){if(!labels[id])return;this.pause();this.moduleId=id;this.last=this.now();this.ended=false;if(!this.allowed()){this.view='rest';this.draw();return;}if(restart){this.states.delete(id);if(id==='dialogue'&&this.integratedInteractions||id==='lesson')this.states.delete('game');}this.view='module';this.stateFor(id);this.draw();if(id==='lesson')this.body?.scrollIntoView?.({block:'start'});if(!this.seenGuides.has(id)){this.seenGuides.add(id);if(id!=='lesson')this.guide(id);}}
  async openPersistent(id,restart=false){
    if(!labels[id])return;if(this.failure){this.draw();return;}const opening=this.opening=(this.opening||0)+1;this.pause();
    if(this.closingTask)await this.closingTask;if(this.leaving)await this.leaving;if(opening!==this.opening)return;
    if(['module','stickers'].includes(this.view)){await this.leavePersistent('connecting');if(this.failure||opening!==this.opening)return;}
    this.view='connecting';this.draw();try{const data=await this.store.begin();if(opening!==this.opening)return;this.applyState(data);this.openLocal(id,restart);await this.checkpoint(id);}
    catch(error){if(opening!==this.opening)return;if(error.state)this.applyState(error.state);if(error.code==='quota_exhausted'){this.view='rest';this.moduleId=id;}else this.failure={recover:true,message:error.message,code:error.code};this.draw();this.scheduleRecovery(error);}
  }
  async playAsset(id){
    if(this.busy||this.failure||this.store.blocked||!this.allowed()||this.view!=='module')return false;const a=this.asset(id),generation=this.generation;
    this.message('正在播放，随时可以暂停或结束。');const ok=await this.player.play(a.path,a.text,{allowFallback:true});
    if(generation!==this.generation)return false;this.message(ok?(this.player.source==='local-file'?'本地声音播放完啦。':'设备回退声音播放完啦。'):'声音暂停或不可用。可以重听、看图或结束。');return ok;
  }
  async sequence(segments){const generation=this.generation;for(const s of segments)if(generation!==this.generation||!await this.playAsset(s.audio))return false;return true;}
  async hearWord(w){this.pause();const moduleId=this.moduleId,generation=this.generation;if(await this.playAsset(w.audio)&&generation===this.generation){const saved=await this.emit('introduced',{moduleId,word:w.text,wordId:w.id,mode:'word_listen',text:w.text});if(saved&&generation===this.generation){this.message('听完 '+w.text+' 啦，可以再听，也可以继续。');return true;}}return false;}
  async dialogueSpeech(s){
    if(this.view!=='module'||this.moduleId!=='dialogue'||this.stateFor('dialogue')!==s||!s.done)return;
    const round=this.pack.modules.dialogue[s.index],option=round.options.find(o=>o.id===s.selection),items=[{audio:option.audio},...option.followUp],generation=this.generation;s.speechIndex=s.speechIndex||0;
    while(s.speechIndex<items.length){const line=items[s.speechIndex];this.message((s.speechIndex===0?'小兔：':'Momo：')+this.asset(line.audio).text);if(!await this.playAsset(line.audio)||generation!==this.generation)return;s.speechIndex++;if(!await this.checkpoint('dialogue'))return;}
    if(generation!==this.generation)return;
    await this.advanceDialogue(s);
  }
  async advanceDialogue(s){
    if(this.view!=='module'||this.moduleId!=='dialogue'||this.stateFor('dialogue')!==s)return;
    if(this.integratedInteractions&&pendingInteractionGame(this.pack,s,this.stateFor('game'))){this.draw();this.message('一起试一试，做完再接着聊。');return;}
    if(s.next()){
      s.speechIndex=0;this.draw();this.body.scrollIntoView?.({block:'start'});
      const nextGeneration=this.generation;
      if(!await this.checkpoint('dialogue')||nextGeneration!==this.generation)return;
      await this.sequence(this.pack.modules.dialogue[s.index].question);
    }else if(this.integratedInteractions)this.complete();
    else{this.draw();this.message('这个主题聊完啦！可以重听，或结束这段对话。');}
  }
  async advanceInteractionGame(dialogue,game){
    if(this.advancingInteraction)return;
    this.advancingInteraction=true;
    try{const generation=this.generation;
      this.pause();if(!game.next())game.finished=true;
      if(!await this.checkpoint('game')||generation!==this.generation)return;
      await this.advanceDialogue(dialogue);
    }finally{this.advancingInteraction=false;}
  }
  async emit(kind,payload,id=this.uuid(),complete=null){
    if(this.busy||(this.pending&&this.pending.operation.id!==id))return false;
    const operation={id,kind,payload:{theme:this.pack.sceneId,sceneId:this.pack.sceneId,contentVersion:this.pack.contentVersion,moduleId:this.moduleId,chapter:labels[payload.moduleId||this.moduleId]||'',...structuredClone(payload)}};
    if(this.store.persistent&&labels[operation.payload.moduleId]){
      const s=this.stateFor(operation.payload.moduleId),progress=serializeProgress(this.pack,operation.payload.moduleId,s);
      if(payload.mode==='story_listen')progress.state.completed=true;
      if(payload.mode==='dialogue_reply')Object.assign(progress.state,{selectedId:payload.selectedId,confirmed:true,speechIndex:0,history:[...s.events,payload]});
      if(['packing_game','tidy_game','scene_find_game','story_order_game'].includes(payload.mode))Object.assign(progress.state,{selectedId:payload.selectedId,attempts:payload.attempt,completed:payload.matched,demonstrated:payload.hinted,order:payload.candidateOrder,...(payload.sequenceOrder?{sequenceOrder:payload.sequenceOrder}:{})});
      if(payload.mode==='lesson_answer'){const match=payload.correct&&s.step.kind==='match';Object.assign(progress.state,{stepId:payload.stepId,attempts:payload.correct?(match?0:s.attempts):payload.attempt,revealed:payload.correct?(match?false:s.revealed):payload.attempt>=2,matched:match?[...s.matched,s.target]:[...s.matched],roundIndex:payload.roundIndex??s.roundIndex});}
      operation.progress=progress;
    }
    if(this.pending&&JSON.stringify(this.pending.operation)!==JSON.stringify(operation))return false;
    this.pending=this.pending||{operation,complete};this.busy=true;this.failure=null;
    this.body?.querySelectorAll('button').forEach(b=>{if(b.textContent!=='暂停声音')b.disabled=true;});
    const generation=this.generation;
    try{this.saveTask=this.store.save(this.pending.operation);const result=await this.saveTask;this.applyState(result||{});if(result?.stickerGranted&&!this.data.events.some(e=>e.kind==='sticker'&&e.payload?.theme===this.pack.sceneId))this.data.events.push({kind:'sticker',payload:{theme:this.pack.sceneId}});this.pending.complete?.();this.pending=null;return true;}
    catch(error){this.failure={message:'这次记录还没有确认保存，请大人帮一下。',details:error.message};this.pause();this.draw();return false;}
    finally{this.busy=false;this.saveTask=null;if(generation!==this.generation&&!this.failure)this.draw();}
  }
  async retry(){if(this.retryTask)return this.retryTask;const task=this.retryNow();this.retryTask=task;try{return await task;}finally{if(this.retryTask===task)this.retryTask=null;}}
  async retryNow(){
    if(this.busy)return;
    if(this.store.persistent&&this.pending){try{const data=await this.store.reconnect();this.applyState(data);this.failure=null;}catch(error){this.failure={recover:true,message:error.message,code:error.code};this.draw();this.scheduleRecovery(error);return;}}
    if(this.store.persistent&&this.failure?.recover&&!this.pending){try{const data=await this.store.reconnect();this.applyState(data,true);await this.store.release();this.failure=null;this.failedTick=null;this.view='home';this.moduleId=null;this.draw();this.message('已核对记录，点击喜欢的环节继续，不会自动播放。');}catch(error){this.failure={recover:true,message:error.message,code:error.code};this.draw();this.scheduleRecovery(error);}return;}
    if(this.failure?.read){const page=this.failure.read;this.failure=null;if(page==='records')await this.records();else await this.stickers();return;}
    if(this.failedTick){const seconds=this.failedTick;try{const result=await this.store.tick(seconds);this.credit(result,seconds);this.failedTick=null;this.failure=null;this.draw();}catch{this.message('计时仍未确认，可以离开，稍后请大人检查。');}return;}
    if(!this.pending)return;const pending=this.pending;
    const s=[...this.states.values()].find(s=>s.pending?.operationId===pending.operation.id);
    this.failure=null;
    if(s?.failed){await s.retry();}else await this.emit(pending.operation.kind,pending.operation.payload,pending.operation.id,pending.complete);
    this.draw();this.message(this.failure?'保存仍未确认，可以离开。':'保存已确认，点继续主动开始，不会自动播放。');
  }
  guide(id){
    if(id==='dialogue'&&this.integratedInteractions&&pendingInteractionGame(this.pack,this.stateFor('dialogue'),this.stateFor('game')))id='game';
    if(!this.body||this.busy||this.failure)return;const notice=node('aside',undefined,'notice module-guide');notice.setAttribute('aria-label','玩法示范');
    const text=id==='game'?(this.pack.modules.game.instructions||(this.pack.modules.game.type==='listen-pack'?'先听完要找的词，再点对应图片。Momo示范不替你提交，可以跳过或结束。':'先点一件物品，再点一个收纳区。可以换选，不用拖动，也可以跳过或结束。')):guides[id];
    notice.append(this.assetImage(this.pack.modules.story[0].characters[0]),node('p',text),button('♫ 听玩法',async()=>{const generation=this.generation;const ok=await this.player.play(null,text,{allowFallback:true});if(generation===this.generation)this.message(ok?'玩法说明听完啦。':'说明声音暂不可用，可以看图、跳过或结束。');}),button('知道啦 / 跳过示范',()=>{this.pause();notice.remove();}));this.body.querySelector('.module-guide')?.remove();this.body.prepend(notice);
  }
  complete(){this.pause();if(this.store.persistent)this.leavePersistent('complete');else{this.view='complete';this.draw();}}
  async end(reason='user'){
    if(this.store.persistent){if(this.closingTask)return this.closingTask;const task=this.endPersistent(reason);this.closingTask=task;try{return await task;}finally{if(this.closingTask===task)this.closingTask=null;}}
    if(this.ending)return;this.ending=true;const active=['module','stickers'].includes(this.view),tail=active?Math.max(0,Math.min(5,(this.now()-this.last)/1000)):0;this.last=this.now();this.pause();this.view='end';this.ended=true;this.draw();
    try{
      if(this.saveTask)await this.saveTask.catch(()=>{});
      if(this.clockTask)await this.clockTask.catch(()=>{});
      if(this.pending||this.failure||this.busy)return;
      if(tail){try{await this.store.tick(tail);this.daily+=tail;this.session+=tail;this.storage?.setItem('picnicSeconds',String(this.session));}catch(error){this.failedTick=tail;this.failure={message:'末段时间尚未确认，可以离开。',details:error.message};this.draw();return;}}
      if(this.moduleId){const ok=await this.emit('end',{reason});if(ok&&this.view==='end'){const generation=this.generation;try{const data=await this.store.state();if(generation!==this.generation)return;this.data=data;}catch{}this.draw();this.message('结束记录已保存。谢谢你一起玩。');}}
    }finally{this.ending=false;}
  }
  async tick(hidden=false){
    const now=this.now();
    if(hidden||!['module','stickers'].includes(this.view)||this.failure||(this.busy&&!this.store.persistent)){this.last=now;return;}
    if(this.tickBusy)return;
    if(now<this.last){this.last=now;return;}
    const endedAt=Math.min(now,this.last+5000),seconds=(endedAt-this.last)/1000;if(seconds===0)return;this.last=endedAt;
    this.tickBusy=true;try{this.clockTask=this.store.tick(seconds,endedAt);const result=await this.clockTask;this.clockTask=null;this.credit(result,seconds);if(!this.allowed())await this.end(this.quota?.dailyRemaining===0||this.daily>=900?'daily_limit':'session_limit');}
    catch(error){this.failedTick=seconds;this.failure={recover:!!this.store.persistent,message:error.message||'时间记录暂未确认，请大人帮一下。',details:error.message};if(error.state)this.applyState(error.state);this.pause();this.draw();}finally{this.tickBusy=false;this.clockTask=null;}
  }
  async endPersistent(reason){
    if(this.ending)return;this.ending=true;const module=this.moduleId;let endToken=null;
    try{
      await this.leavePersistent('end');
      if(this.failure||this.pending||!module)return;
      // Reacquire only to settle the already requested end; never restart activity.
      const data=await this.store.acquire(true);endToken=this.store.token;this.applyState(data);
      const result=await this.store.close({theme:this.pack.sceneId,sceneId:this.pack.sceneId,contentVersion:this.pack.contentVersion,moduleId:module,chapter:labels[module]||'',reason},module?serializeProgress(this.pack,module,this.stateFor(module)):null);
      this.applyState(result);this.data=await this.store.state();if(this.view==='end'){this.draw();this.message('已经保存这次参与记录。下次可以从喜欢的环节开始。');}
    }catch(error){this.failure={recover:true,message:error.message,code:error.code};if(this.view==='end')this.draw();}
    finally{this.ending=false;try{await this.store.release(endToken);}catch{}}
  }
  async records(){if(this.store.persistent)await this.leavePersistent('records');this.pause();this.view='records';const generation=++this.generation;try{const data=await this.store.state();if(generation!==this.generation)return;this.data=data;this.applyState(data);this.draw();}catch{if(generation===this.generation){this.failure={read:'records',message:'记录暂时无法读取，请大人帮一下。'};this.draw();}}}
  async stickers(){if(this.store.persistent){await this.leavePersistent('connecting');try{this.applyState(await this.store.begin());}catch(error){if(error.state)this.applyState(error.state);this.failure={recover:true,message:error.message};this.draw();return;}}this.pause();this.view='stickers';this.last=this.now();const generation=++this.generation;try{const data=await this.store.state();if(generation!==this.generation)return;this.data=data;this.applyState(data);this.draw();}catch{if(generation===this.generation){this.failure={read:'stickers',message:'贴纸暂时无法读取，请大人帮一下。'};this.draw();}}}
  draw(){
    this.pause();const generation=++this.generation;this.root.replaceChildren();this.root.classList?.toggle('lesson-mode',this.view==='module'&&this.moduleId==='lesson');this.status=node('p','', 'activity-status');this.status.id='message';this.status.setAttribute('role','status');
    const homeActions=this.view==='home'&&!this.failure;
    const toolbar=node('div',undefined,homeActions?'scene-controls home-actions':'toolbar');toolbar.append(button('返回首页',()=>this.home()),button('结束 · 再见啦',()=>this.end()));if(!homeActions)this.root.append(toolbar);
    if(this.store.internal)this.root.append(node('p','内部整理样例 · 本页内存演练，未写入家庭记录','notice'));
    if(this.failure&&this.view!=='end'){const card=node('section',undefined,'notice'),conflict=this.failure.code==='other_page_active',waiting=conflict&&this.failure.waitingForLease;card.append(node('h1',waiting?'正在恢复页面连接':conflict?'另一个页面正在使用':'请大人帮一下'),node('p',waiting?'如果刚刚刷新了页面，会在上一个活动释放后自动重新连接。如果其他窗口仍在使用，请先在那里返回首页或结束活动。':conflict?'请先在正在使用的页面返回首页或结束活动，再回到这里重新连接。':this.failure.message),button(conflict?'重新连接':'重试保存',()=>this.retry()),button('先离开',()=>this.end()));this.root.append(card,this.status);return;}
    if(this.view==='module'&&!this.allowed())this.view='rest';
    if(this.view==='connecting'){this.root.append(node('h1','正在准备这一段小发现……'),this.status);return;}
    if(this.view==='suspended'){this.root.append(node('h1','声音已经暂停啦'),node('p','准备好后，可以从刚才的环节继续。'),button('继续刚才的环节',()=>this.open(this.moduleId),'primary'),this.status);return;}
    if(this.view==='parent'){this.root.append(this.status);return;}
    if(this.view==='home'){this.drawHome(toolbar);return;}
    if(this.view==='end'||this.view==='rest'){
      const earned=this.data.events.some(e=>e.kind==='sticker'&&e.payload?.theme===this.pack.sceneId),limited=!this.allowed();
      const dailyLimit=this.quota?this.quota.dailyRemaining<=0:this.daily>=900;
      const title=limited?(this.quota?.dateAnomaly?'设备日期需要检查':dailyLimit?'今天的体验时间用完啦':'这一段体验到时间啦'):'谢谢你，一起玩。';
      const explanation=limited?(this.quota?.dateAnomaly?'请检查设备日期后再试。':dailyLimit?'每日体验时间已用完，明天可以继续。你的记录和进度已保留。':'本段体验时间已用完。你的记录和进度已保留。'):'已经停止声音和活动。随时可以回到首页。';
      this.root.append(node('h1',title),image(earned?this.memoryImage():'illustrations/cloud.svg','', 'sticker'),node('p',explanation),this.status);
      if(earned)this.root.append(node('p','相伴纪念已收藏。'));
      if(this.failure)this.root.append(node('p','有记录尚未确认。保留在本页，关闭页面可能丢失。'),button('重试未确认记录',()=>this.retry()));return;
    }
    if(this.view==='complete'){this.root.append(node('h1','这一段结束啦'),node('p','想再玩一次，还是看看其他玩法？'),actions(button('再玩一次',()=>this.open(this.moduleId,true),'primary'),button('看看其他玩法',()=>this.home()),button('结束',()=>this.end())),this.status);return;}
    if(this.view==='records'){this.drawRecords();return;}
    if(this.view==='stickers'){const earned=this.data.events.some(e=>e.kind==='sticker'&&e.payload?.theme===this.pack.sceneId);this.root.append(node('h1','我们的小小纪念'),image(earned?this.memoryImage():'illustrations/cloud.svg','', 'sticker'),node('p',this.pack.title),node('p',earned?'这次相伴已经收藏。':'还没有这段相伴的贴纸。听一个词或参与一次互动，就可能留下纪念。'));return;}
    if(this.moduleId==='lesson')this.root.append(speedControls(this));else{const nav=node('nav',undefined,'chapter-nav');for(const [id]of this.visibleModules()){const b=button(this.moduleLabel(id),()=>this.open(id),id===this.moduleId?'active':'');if(id===this.moduleId)b.setAttribute('aria-current','page');nav.append(b);}this.root.append(nav,speedControls(this));}
    this.body=node('section');this.body.id='stage';this.root.append(this.body);const s=this.stateFor(this.moduleId);
    const c={app:this,pack:this.pack,body:this.body,messageNode:this.status,active:()=>this.generation===generation,message:text=>this.message(text),redraw:()=>this.draw(),pause:()=>this.pause(),play:id=>this.playAsset(id),sequence:segments=>this.sequence(segments),word:id=>this.word(id),assetImage:(id,alt)=>this.assetImage(id,alt),hearWord:w=>this.hearWord(w),guide:id=>this.guide(id),complete:()=>this.complete(),lock:()=>this.body.querySelectorAll('button').forEach(b=>{if(b.textContent!=='暂停声音')b.disabled=true;}),emit:(kind,payload)=>this.emit(kind,payload,undefined,payload.mode==='story_listen'?()=>{const story=s.story??s;if(story.scene.id===payload.stepId&&story.fragment>=story.scene.segments.length&&story.heard.size===payload.heard.length)story.saved=true;}:null)};
    if(this.moduleId==='dialogue'&&this.integratedInteractions&&pendingInteractionGame(this.pack,s,this.stateFor('game'))){
      const game=this.stateFor('game'),round=this.pack.modules.dialogue[s.index],answer=round.options.find(o=>o.id===s.selection);
      const bridge=node('aside',undefined,'notice interaction-bridge');bridge.append(node('b','一起试试看'),node('p',answer.followUp.map(line=>line.text).join(' ')));this.body.append(bridge);
      renderGame({...c,advanceGame:()=>this.advanceInteractionGame(s,game),complete:()=>this.advanceInteractionGame(s,game)},game);
    }else ({story:renderStory,dialogue:renderDialogue,game:renderGame,summary:renderSummary,lesson:renderLesson})[this.moduleId](c,s);
    if(this.busy)this.body.querySelectorAll('button').forEach(b=>{if(b.textContent!=='暂停声音')b.disabled=true;});
  }
  drawHome(toolbar){
    if(this.navigateScene)this.root.append(button('← 切换主题',()=>this.selectScene(null),'theme-back'));
    const hero=node('section',undefined,'hero'),copy=node('div');copy.append(node('div','MOMO’S LITTLE DISCOVERIES','eyebrow'),node('h1',this.pack.title),node('p','跟着墨墨，用自己的节奏玩完这节课。不要求记住全部单词。'));const art=node('div',undefined,'picnic-scene');
    const first=this.pack.modules.story[0];
    if(first.illustration){art.className+=' content-home-scene'+(this.pack.sceneId==='tidy'?' tidy-home-scene':'');const picture=this.assetImage(first.illustration,this.pack.title);picture.className='picnic-illustration';art.append(picture);}
    else if(first.templateId==='picnic-meadow')art.append(image('picnic-sketch.svg','Momo 的生活小发现','picnic-illustration'));
    else{art.className+=' tidy-home-scene';art.append(this.assetImage(first.characters[0],this.pack.title));const toys=node('div',undefined,'home-toys');for(const word of this.pack.words)toys.append(this.assetImage(word.image,word.cn));art.append(toys);}hero.append(copy,art);this.root.append(hero);
    const cards=node('div',undefined,'cards');for(const [id]of this.visibleModules()){const b=button('',()=>this.open(id),'activity');b.append(node('b',id==='lesson'?'开始这节课':this.moduleLabel(id)),node('small',this.states.has(id)?'继续上次 →':'一起看看 →'));cards.append(b);}this.root.append(cards,this.status);
    if(this.data.notices?.length){const notes=node('details',undefined,'notice');notes.append(node('summary','给家长的说明'));for(const text of this.data.notices)notes.append(node('p',text));this.root.append(notes);}
    this.root.append(toolbar);
  }
  drawRecords(){this.root.append(observationForm(this));this.root.append(node('h1','体验记录'),node('p','记录参与事实，不代表掌握，也不推断偏好。'));if(this.data.summary)this.root.append(node('p',this.data.summary.participationDays+' 个参与日 · '+this.data.summary.moduleParticipations+' 个模块参与记录'),node('p','今日已确认前台时间约 '+Math.floor((this.data.quota?.dailyUsed||0)/60)+' 分钟（向下取整）；旧版日汇总保留，来源不完整的历史不补造归属。'));if(!this.data.events.length)this.root.append(node('p','还没有记录。可以先去听个故事。'));for(const e of this.data.events){const p=e.payload||{},row=node('article',undefined,'row');row.append(node('small',(e.day||'日期未知')+' · '+(p.chapter||p.moduleId||'来源未知')),node('h3',e.kind==='sticker'?'相伴纪念':e.kind==='end'?'结束体验':p.mode==='dialogue_reply'?'角色回应':p.word||p.mode||'参与记录'));if(p.reply||p.text)row.append(node('p',p.reply||p.text));this.root.append(row);}}
}

