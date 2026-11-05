export class LegacyStore{
  constructor(fetcher=globalThis.fetch){this.fetcher=fetcher;this.internal=false;}
  async request(path,data){const response=await this.fetcher('/api/'+path,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{cache:'no-store'});if(!response.ok)throw Error('本机保存服务暂不可用');return response.json();}
  state(){return this.request('state');}
  save(operation){return this.request('event',{id:operation.id,kind:operation.kind,payload:operation.payload});}
  tick(seconds){return this.request('tick',{seconds});}
}
export class MemoryStore{
  constructor(){this.internal=true;this.events=new Map();this.seconds=0;}
  async state(){return {seconds:this.seconds,events:[...this.events.values()].map(e=>({...e,day:'内部演练'}))};}
  async save(operation){const old=this.events.get(operation.id);if(old&&JSON.stringify(old)!==JSON.stringify(operation))throw Error('operation ID conflict');this.events.set(operation.id,structuredClone(operation));return {ok:true};}
  async tick(seconds){this.seconds+=seconds;return {ok:true};}
}
export class MemoryStorage{
  constructor(){this.values=new Map();}
  getItem(key){return this.values.get(key)??null;}
  setItem(key,value){this.values.set(key,String(value));}
  get length(){return this.values.size;}
  key(index){return [...this.values.keys()][index]??null;}
  removeItem(key){this.values.delete(key);}
}
