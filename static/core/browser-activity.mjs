// Browser liveness is separate from the server's durable write lease.
// A destroyed document releases its Web Lock even when pagehide fetches never finish.
const RECORD='momo.v3.active-lease',LOCK='momoplanet.active-document.v3';
function conflict(){const error=new Error('另一个页面正在使用，请先结束原页面的活动。');error.code='other_page_active';error.retryAfterMs=1000;error.browserLive=true;return error;}
export class BrowserActivity{
  constructor({locks=globalThis.navigator?.locks,storage=globalThis.localStorage}={}){Object.assign(this,{locks,storage});this.held=false;this.claiming=null;}
  get available(){return typeof this.locks?.request==='function';}
  credential(){
    if(!this.held)return null;
    try{const p=JSON.parse(this.storage.getItem(RECORD)||'null');return p&&typeof p.owner==='string'&&typeof p.token==='string'&&typeof p.experienceId==='string'?p:null;}catch{return null;}
  }
  async claim(){
    if(!this.available)return null;
    if(this.dropping)await this.dropping;
    if(this.held)return this.credential();
    if(this.claiming)return this.claiming;
    this.cancelClaim=false;
    const task=new Promise((resolve,reject)=>{
      const request=this.locks.request(LOCK,{ifAvailable:true},lock=>{
        if(!lock){reject(conflict());return;}
        if(this.cancelClaim){const error=new Error('页面已经离开。');error.code='page_closing';reject(error);return;}
        this.held=true;
        const hold=new Promise(release=>{this.unlock=()=>{this.held=false;this.unlock=null;release();};});
        resolve(this.credential());return hold;
      });
      this.requestTask=Promise.resolve(request);this.requestTask.catch(reject);
    });
    this.claiming=task;try{return await task;}finally{if(this.claiming===task)this.claiming=null;}
  }
  remember(credential){if(!this.held)return;try{this.storage.setItem(RECORD,JSON.stringify(credential));}catch{/* Server lease remains authoritative; fall back to expiry if storage is unavailable. */}}
  clear(owner,token){
    try{const current=JSON.parse(this.storage.getItem(RECORD)||'null');if(current?.owner===owner&&current?.token===token)this.storage.removeItem(RECORD);}catch{}
  }
  async drop(){
    if(this.dropping)return this.dropping;
    this.cancelClaim=true;
    this.unlock?.();const task=this.requestTask?.catch(()=>{});
    if(!task)return;
    this.dropping=task;try{await task;}finally{if(this.dropping===task){this.dropping=null;this.requestTask=null;}}
  }
}
