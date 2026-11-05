// Models only the standard Web Locks exclusivity/lifetime contract. HTTP tests
// use the real Python backend; this is not claimed as a Chrome visual test.
export class LockHarness{
  constructor(){this.current=null;this.requests=0;}
  request(name,options,callback){
    this.requests++;
    return Promise.resolve().then(async()=>{
      if(this.current)return callback(null);
      let terminated;const death=new Promise(resolve=>terminated=resolve),entry={name,terminated};this.current=entry;
      try{return await Promise.race([Promise.resolve(callback({name})),death]);}
      finally{if(this.current===entry)this.current=null;}
    });
  }
  terminateDocument(){const old=this.current;if(old){this.current=null;old.terminated();}}
}
