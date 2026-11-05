export class StoryState{
  constructor(scenes){this.scenes=scenes;this.step=0;this.fragment=0;this.heard=new Set();this.saved=false;this.running=false;this.run=0;}
  get scene(){return this.scenes[this.step];}
  async play(playSegment,save,checkpoint=async()=>true){
    if(this.running)return false;const run=++this.run;this.running=true;
    try{
      while(this.fragment<this.scene.segments.length){const s=this.scene.segments[this.fragment];if(!await playSegment(s)||run!==this.run)return false;this.heard.add(s.id);this.fragment++;if(!await checkpoint()||run!==this.run)return false;}
      if(!this.saved){const snapshot={stepId:this.scene.id,segments:this.scene.segments.map(x=>({id:x.id,text:x.text})),heard:[...this.heard]};if(!await save(snapshot)||run!==this.run)return false;this.saved=true;}
      return true;
    }finally{if(run===this.run)this.running=false;}
  }
  pause(){this.run++;this.running=false;}
  replay(){this.pause();this.fragment=0;this.heard.clear();this.saved=false;}
  previous(){if(this.step===0)return false;this.replay();this.step--;return true;}
  next(){this.pause();if(this.step+1>=this.scenes.length)return false;this.step++;this.fragment=0;this.heard.clear();this.saved=false;return true;}
}

