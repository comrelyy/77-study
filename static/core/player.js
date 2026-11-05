(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.MomoAudio=api;})(globalThis,()=>{
  class Player{
    constructor({audio=url=>new Audio(url),fallback=null}={}){this.audio=audio;this.fallback=fallback;this.token=0;this.current=null;this.finish=null;this.source=null;this.rate=1;}
    setRate(rate){if(![.8,1].includes(rate))throw Error("Unsupported playback rate");this.stop();this.rate=rate;}
    stop(){this.token++;if(this.finish)this.finish(false);this.finish=null;if(this.current){this.current.pause();this.current=null;}if(this.cancelFallback){this.cancelFallback();this.cancelFallback=null;}}
    play(url,text,{allowFallback=false}={}){
      this.stop();const token=this.token;this.source=null;
      return new Promise(resolve=>{
        let settled=false,fallbackStarted=false;
        const done=ok=>{if(settled)return;settled=true;if(this.finish===done)this.finish=null;resolve(ok&&token===this.token);};this.finish=done;
        const failed=()=>{
          if(token!==this.token||settled||fallbackStarted)return;
          if(!allowFallback||!this.fallback){done(false);return;}
          fallbackStarted=true;this.source='development-speech';
          try{this.cancelFallback=this.fallback(text,ok=>done(ok),this.rate);}catch{done(false);}
        };
        if(!url){failed();return;}
        try{const audio=this.audio(url);this.current=audio;audio.playbackRate=this.rate;audio.preservesPitch=true;this.source='local-file';audio.onended=()=>{if(!fallbackStarted)done(true);};audio.onerror=failed;Promise.resolve(audio.play()).catch(failed);}catch{failed();}
      });
    }
  }
  return {Player};
});
