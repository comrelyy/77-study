import {StoryState} from './story-state.mjs';
const ANSWER_KINDS=['quiz','fill','reply','match'];
export class LessonState{
  constructor(pack,{random=Math.random}={}){
    this.pack=pack;this.random=random;this.practiceId=null;
    this.steps=pack.lesson.steps.filter(x=>pack.lesson.reviewed||!x.review);
    this.index=0;this.enter();
  }
  get step(){return this.steps[this.index];}
  get target(){const s=this.step;return s.kind==='match'?s.words.find(w=>!this.matched.has(w))??null:null;}
  enter(){
    const s=this.step;
    this.attempts=0;this.revealed=false;this.done=false;this.matched=new Set();this.roundIndex=0;this.story=null;this.freshGame=s.kind==='game';
    if(s.kind==='reply')this.roundIndex=Math.floor(this.random()*s.rounds.length);
    if(s.kind==='story')this.story=new StoryState([this.pack.modules.story.find(x=>x.id===s.storyId)]);
  }
  correctId(){
    const s=this.step;
    return s.kind==='match'?this.target:s.kind==='reply'?s.rounds[this.roundIndex].answer:s.answer;
  }
  answer(selectedId){
    if(!ANSWER_KINDS.includes(this.step.kind)||this.done)return {correct:false,revealed:this.revealed,finished:this.done};
    if(selectedId===this.correctId()){
      if(this.step.kind==='match'){
        this.matched.add(this.target);this.attempts=0;this.revealed=false;
        this.done=this.target===null;
      }else this.done=true;
      return {correct:true,revealed:false,finished:this.done};
    }
    this.attempts++;if(this.attempts>=2)this.revealed=true;
    return {correct:false,revealed:this.revealed,finished:false};
  }
  canContinue(){return !ANSWER_KINDS.includes(this.step.kind)||this.done||this.revealed;}
  next(){
    if(this.step.kind==='end'||this.index+1>=this.steps.length)return false;
    return this.goTo(this.index+1);
  }
  previous(){return this.index>0&&this.goTo(this.index-1);}
  // Any step can be entered from the navigation; entering always starts that step over.
  goTo(index){
    if(!Number.isInteger(index)||index<0||index>=this.steps.length)return false;
    if(this.story)this.story.pause();
    this.index=index;this.enter();return true;
  }
  skip(){return this.next();}
}
