const fs=require('fs'),vm=require('vm'),assert=require('assert');
const nodes=new Map();const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',onclick:null,classList:{add(){},remove(){}},insertAdjacentHTML(where,text){this.innerHTML+=text},pause(){}});return nodes.get(key)};
const events=[];const context={console,crypto:{randomUUID:()=>String(events.length)},sessionStorage:{getItem:()=>null,setItem(){}},document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){},hidden:false},window:{},setInterval(){},setTimeout,Date,Math,Audio:function(){},fetch:async(path,options)=>({ok:true,json:async()=>{if(options?.body){events.push(JSON.parse(options.body));return {ok:true}}return {seconds:0,events:[]}}})};
vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/static/theme.js','utf8'),context);
vm.runInContext(fs.readFileSync(__dirname+'/static/dialogue.js','utf8'),context);
async function run(){
 await new Promise(r=>setImmediate(r));
 assert(node('#app').innerHTML.includes('野餐小故事'));
 for(let chapter=0;chapter<4;chapter++){
  vm.runInContext(`openChapter(${chapter})`,context);
  assert(node('#stage').innerHTML.length>100);
 }
 vm.runInContext('openChapter(2);played=true;',context);
 await vm.runInContext("pickFood('banana')",context);
 assert.equal(events.at(-1).payload.correct,false);
 vm.runInContext('played=true;',context);
 await vm.runInContext("pickFood('apple')",context);
 assert.equal(events.at(-1).payload.correct,true);
 assert(node('#basket').innerHTML.includes('illustrations/apple.svg'));
 vm.runInContext('next()',context);
 assert.equal(vm.runInContext('step',context),1);
 vm.runInContext('openChapter(3)',context);
 assert(node('#stage').innerHTML.includes('milk'));
 await vm.runInContext('endTheme()',context);
 assert.equal(events.at(-1).kind,'end');
 vm.runInContext('speak=async()=>true;',context);
 for(let s=0;s<4;s++){
  for(let i=0;i<3;i++){
   vm.runInContext('openChapter(1);step='+s+';render()',context);
   assert(node('#stage').innerHTML.includes('chooseReply(2)'));
   await vm.runInContext('window.chooseReply('+i+')',context);
   assert.equal(events.at(-1).payload.mode,'dialogue_reply');
   assert.equal(events.at(-1).payload.reply_index,i);
  }
 }
 vm.runInContext('openChapter(1)',context);
 for(let i=0;i<4;i++){
  await vm.runInContext('window.chooseReply(0)',context);
  assert.equal(vm.runInContext('step',context),i+1);
 }
 assert(node('#stage').innerHTML.includes('Hello, Bunny!'));
 assert(node('#stage').innerHTML.includes('lovely picnic'));
 assert(node('#stage').innerHTML.includes('openChapter(2)'));
 // A paused response must not advance or duplicate the saved choice on resume.
 vm.runInContext('openChapter(1);speak=()=>new Promise(resolve=>{window.resolveSpeech=resolve})',context);
 const paused=vm.runInContext('window.chooseReply(0)',context);
 await new Promise(r=>setImmediate(r));
 vm.runInContext('window.pauseDialogue();window.resolveSpeech(true)',context);
 await paused;
 assert.equal(vm.runInContext('step',context),0);
 const count=events.length;
 vm.runInContext('speak=async()=>true',context);
 await vm.runInContext('window.playDialogue()',context);
 assert.equal(vm.runInContext('step',context),1);
 assert.equal(events.length,count);
 // Leaving the chapter during playback must cancel continuation.
 vm.runInContext('openChapter(1);speak=()=>new Promise(resolve=>{window.resolveSpeech=resolve})',context);
 const leaving=vm.runInContext('window.chooseReply(0)',context);
 await new Promise(r=>setImmediate(r));
 vm.runInContext('home();window.resolveSpeech(true)',context);
 await leaving;
 assert.equal(vm.runInContext('screen',context),'home');
 vm.runInContext('speak=async()=>true;openChapter(0)',context);
 assert(node('#stage').innerHTML.includes('Hello! I am Momo.'));
 await vm.runInContext('window.playStory()',context);
 assert.equal(events.at(-1).payload.mode,'story_listen');
 console.log('PASS: interactive dialogue (12 branches), English story,');
 console.log('PASS: home, four modules, game mismatch/match, next step, summary, end record');
}
run().catch(e=>{console.error(e);process.exitCode=1});


