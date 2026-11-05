export class StorageError extends Error{
  constructor(code,message,state=null){super(message);this.code=code;this.state=state;}
}
export class PersistentStore{
  constructor({fetcher=(...args)=>globalThis.fetch(...args),storage=globalThis.localStorage,uuid=()=>crypto.randomUUID(),now=()=>Date.now(),activity=null}={}){
    Object.assign(this,{fetcher,storage,uuid,now,activity});this.persistent=true;this.internal=false;this.owner=uuid();this.token=null;this.experienceId=uuid();this.quota=null;this.tail=Promise.resolve();this.sequence=0;this.receipts=new Map();this.originals=new Map();this.revisions=new Map();this.predictedRevisions=new Map();this.blocked=false;this.needsProgressReload=false;this.tickKey=null;this.prefix='momo.v3.pending.';this.retired=false;
  }
  async request(path,body,keepalive=false){
    let response;try{response=await this.fetcher('/api/v3/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner:this.owner,token:this.token,...body}),keepalive,signal:AbortSignal.timeout(5000)}:{cache:'no-store',signal:AbortSignal.timeout(5000)});}catch{throw new StorageError('connection_failed','本机保存暂未确认，请大人帮一下。');}
    let data;try{data=await response.json();}catch{throw new StorageError('upgrade_required','请大人重新启动本机服务，再打开页面。');}
    if(!response.ok){const error=new StorageError(data.code||'request_failed',data.error||'保存尚未确认',data.state);if(Number.isFinite(data.retryAfterMs))error.retryAfterMs=data.retryAfterMs;throw error;}
    if(data.quota){this.acceptQuota(data.quota);data.quota=this.quota;}for(const p of data.progress||[]){const key=p.sceneId+'/'+p.moduleId;this.revisions.set(key,Math.max(this.revisions.get(key)||0,p.revision||0));}return data;
  }
  acceptQuota(quota){
    this.seenAuthorities||=new Set();const current=this.quota;
    if(quota.authorityInstance&&current?.authorityInstance){
      if(quota.authorityInstance===current.authorityInstance&&quota.authoritySequence<current.authoritySequence)return;
      if(quota.authorityInstance!==current.authorityInstance&&this.seenAuthorities.has(quota.authorityInstance))return;
    }
    if(quota.authorityInstance)this.seenAuthorities.add(quota.authorityInstance);this.quota=quota;
  }
  entries(){
    try{const items=[];for(let i=0;i<this.storage.length;i++){const key=this.storage.key(i);if(key?.startsWith(this.prefix)){const value=JSON.parse(this.storage.getItem(key));if(value.schemaVersion!==1||!['operation','tick'].includes(value.type)||!value.id||!value.body)throw Error('invalid pending entry');items.push({...value,key});}}return items.sort((a,b)=>a.createdAt-b.createdAt||a.sequence-b.sequence||a.id.localeCompare(b.id));}
    catch{throw new StorageError('local_storage_failed','本机待确认记录无法读取，不能保证恢复。请先离开并请大人检查。');}
  }
  persist(entry){
    const key=this.prefix+entry.id;
    try{const old=this.storage.getItem(key);if(old){const parsed=JSON.parse(old);if(JSON.stringify(parsed.body)!==JSON.stringify(entry.body))throw new StorageError('id_conflict','同一编号的提交内容不同');return {...parsed,key};}const value={schemaVersion:1,...entry,createdAt:this.now(),sequence:++this.sequence};this.storage.setItem(key,JSON.stringify(value));if(!this.storage.getItem(key))throw Error('write not retained');return {...value,key};}
    catch(error){if(error instanceof StorageError)throw error;throw new StorageError('local_storage_failed','待确认记录无法保存在本机；关闭页面后可能无法恢复。');}
  }
  async acquire(recoverOnly=false){
    if(this.retired)throw new StorageError('page_closing','页面正在离开，不再申请活动锁。');
    if(this.acquiring)return this.acquiring;
    const task=this.acquireNow(recoverOnly);this.acquiring=task;
    try{return await task;}finally{if(this.acquiring===task)this.acquiring=null;}
  }
  async acquireNow(recoverOnly){
    const previous=await this.activity?.claim();
    if(this.retired){await this.activity?.drop();throw new StorageError('page_closing','页面正在离开。');}
    if(previous)this.experienceId=previous.experienceId;
    if(!this.experienceId)this.experienceId=this.uuid();
    try{
      let data;
      const body=()=>({experienceId:this.experienceId,recoverOnly,...(previous?{previousOwner:previous.owner,resumeToken:previous.token}:{})});
      try{data=await this.request('enter',body());}catch(error){if(error.code!=='experience_closed'||!previous)throw error;this.experienceId=this.uuid();data=await this.request('enter',body());}
      this.token=data.token;this.experienceId=data.experienceId;
      if(this.retired){await this.release(data.token);throw new StorageError('page_closing','页面已经离开。');}
      this.activity?.remember({owner:this.owner,token:this.token,experienceId:this.experienceId});return data;
    }catch(error){await this.activity?.drop();throw error;}
  }
  async begin(){if(this.entries().length)throw new StorageError('pending_operations','有上次记录待确认，请先重试。');return this.acquire(false);}
  async state(){
    let data=await this.request('state');const pending=this.entries().length;
    if(pending){try{await this.acquire(true);await this.flush();data=await this.request('state');this.predictedRevisions=new Map(this.revisions);this.blocked=false;this.needsProgressReload=false;data.recoveryMessage='已经核对上次未确认记录。异常关闭前的体验可能不完整，继续时不会自动播放。';}catch(error){data.pendingCount=this.entries().length;data.recoveryError={code:error.code,message:error.message,retryAfterMs:error.retryAfterMs,browserLive:error.browserLive};}}
    return data;
  }
  save(raw){
    try{
      if(this.receipts.has(raw.id)){const original=this.originals.get(raw.id),normalize=p=>{if(!p)return p;const result=structuredClone(p);delete result.expectedRevision;return result;};if(!original||JSON.stringify(original.payload)!==JSON.stringify(raw.payload)||original.kind!==raw.kind||JSON.stringify(normalize(original.progress))!==JSON.stringify(normalize(raw.progress)))throw new StorageError('id_conflict','同一编号的提交内容不同');return Promise.resolve(this.receipts.get(raw.id));}
      if(!this.token||!this.quota?.segmentId)throw new StorageError('lease_required','请先重新连接活动页。');
      const key=this.prefix+raw.id,old=this.storage.getItem(key);
      if(this.blocked&&!old)throw new StorageError('pending_operations','先核对待确认记录，再开始新的活动。');
      let entry;
      if(old){entry=JSON.parse(old);if(entry.type!=='operation'||JSON.stringify(entry.body.operation.payload)!==JSON.stringify(raw.payload)||entry.body.operation.kind!==raw.kind)throw new StorageError('id_conflict','同一编号的提交内容不同');}
      else{const operation={...structuredClone(raw),experienceId:this.experienceId,segmentId:this.quota.segmentId,confirmedAt:this.now(),confirmationLease:this.token};let key,revision;if(operation.progress){key=operation.progress.sceneId+'/'+operation.progress.moduleId;revision=Math.max(this.predictedRevisions.get(key)||0,this.revisions.get(key)||0);operation.progress.expectedRevision=revision;}entry=this.persist({id:raw.id,type:'operation',body:{operation}});if(key)this.predictedRevisions.set(key,revision+1);}
      return this.sendEntry(entry).then(result=>{if(raw.kind==='end')this.experienceId=null;return result;});
    }catch(error){return Promise.reject(error instanceof StorageError?error:new StorageError('local_storage_failed','本机待确认记录无法读取，不能保证恢复。'));}
  }
  checkpoint(progress){
    const id=this.uuid();return this.save({id,kind:'checkpoint',payload:{sceneId:progress.sceneId,moduleId:progress.moduleId,contentVersion:progress.contentVersion},progress});
  }
  tick(seconds,endedAt=this.now()){
    try{
      let entry=this.tickKey?this.entries().find(x=>x.id===this.tickKey):null;
      if(!entry){if(this.blocked)throw new StorageError('pending_operations','计时尚未核对，先重试再继续');if(!this.token||!this.quota?.segmentId)throw new StorageError('lease_required','活动页尚未连接');const id=this.uuid();entry=this.persist({id,type:'tick',body:{id,segmentId:this.quota.segmentId,startedAt:Math.round(endedAt-seconds*1000),endedAt:Math.round(endedAt),originToken:this.token}});this.tickKey=id;}
      return this.sendEntry(entry).then(result=>{if(this.tickKey===entry.id)this.tickKey=null;return result;});
    }catch(error){return Promise.reject(error);}
  }
  queueFinalTick(seconds,endedAt=this.now()){
    if(!(seconds>0)||!this.token||!this.quota?.segmentId)return Promise.resolve(null);
    const id=this.uuid(),entry=this.persist({id,type:'tick',body:{id,segmentId:this.quota.segmentId,startedAt:Math.round(endedAt-seconds*1000),endedAt:Math.round(endedAt),originToken:this.token}});
    return this.sendEntry(entry);
  }
  retire(progress=[],seconds=0,endedAt=this.now()){
    if(this.retired)return;
    const token=this.token;
    // Persist synchronously before releasing. Recovery can send these using the
    // replacement page's lease while preserving their original confirmation proof.
    if(token){for(const record of progress)this.checkpoint(record).catch(()=>{});try{this.queueFinalTick(seconds,endedAt).catch(()=>{});}catch{}}
    this.retired=true;
    if(token)this.release(token).catch(()=>{});else this.activity?.drop();
  }
  sendEntry(entry){return this.flush().then(()=>this.receipts.get(entry.id)).catch(error=>{if(this.receipts.has(entry.id))return {...this.receipts.get(entry.id),pendingCount:this.entries().length,recoveryError:{code:error.code,message:error.message}};throw error;});}
  flush({keepalive=false}={}){
    const task=this.tail.catch(()=>{}).then(async()=>{
      const items=this.entries();if(!items.length){this.blocked=this.needsProgressReload;return;}if(!this.token)await this.acquire(true);
      for(const item of items){
        const op=item.body.operation;if(item.type==='operation')this.originals.set(item.id,op);
        let result;try{result=await this.request(item.type==='tick'?'tick':'operation',item.body,keepalive);}catch(error){if(op?.kind==='checkpoint'&&['progress_conflict','invalid_confirmation'].includes(error.code)){result={ok:true,discardedCheckpoint:true,progressConflict:true};this.needsProgressReload=true;}else throw error;}
        if(result.progressConflict||result.contentUpdated)this.needsProgressReload=true;
        if(op?.progress&&Number.isInteger(result.revision)){const key=op.progress.sceneId+'/'+op.progress.moduleId;this.revisions.set(key,Math.max(this.revisions.get(key)||0,result.revision));}
        this.receipts.set(item.id,result);try{this.storage.removeItem(item.key||this.prefix+item.id);}catch{throw new StorageError('local_storage_failed','已收到服务确认，但本机待确认项尚未清理。');}
      }this.blocked=this.needsProgressReload;
    }).catch(error=>{this.blocked=true;throw error;});this.tail=task;return task;
  }
  async reconnect(){if(this.reconnecting)return this.reconnecting;const task=(async()=>{this.token=null;await this.acquire(true);await this.flush();const data=await this.request('state');this.predictedRevisions=new Map(this.revisions);this.needsProgressReload=false;this.blocked=false;return data;})();this.reconnecting=task;try{return await task;}finally{if(this.reconnecting===task)this.reconnecting=null;}}
  heartbeat(){return this.request('heartbeat',{});}
  async release(token=this.token){if(!token){await this.activity?.drop();return;}try{await this.request('release',{token},true);this.activity?.clear(this.owner,token);}finally{if(this.token===token){this.token=null;await this.activity?.drop();}}}
  async close(payload,progress=null){return this.save({id:this.uuid(),kind:'end',payload,progress});}
}
