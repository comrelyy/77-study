export function serializeProgress(pack,module,state){
  const value={practiceId:state.practiceId};
  if(module==='story')Object.assign(value,{stepId:state.scene.id,fragmentId:state.scene.segments[state.fragment]?.id||null,heard:[...state.heard],completed:state.saved});
  else if(module==='dialogue')Object.assign(value,{stepId:pack.modules.dialogue[state.index].id,selectedId:state.selection,confirmed:state.done,speechIndex:state.speechIndex||0,demo:state.demo,history:state.events});
  else if(module==='game')Object.assign(value,{stepId:pack.modules.game.questions[state.index].id,selectedId:state.selection,order:state.candidates(),attempts:state.attempts,demonstrated:state.demoUsed,helpTypes:state.helpTypes,completed:state.done,finished:state.finished===true,...(pack.modules.game.type==='story-order'?{sequenceOrder:[...state.sequence]}:{})});
  else if(module==='lesson'){
    const st=state.story,seg=st?.scene.segments[st.fragment];
    Object.assign(value,{stepId:state.step.id,attempts:state.attempts,revealed:state.revealed,matched:[...state.matched],roundIndex:state.roundIndex,heard:st?[...st.heard]:[],fragmentId:st?(seg?.id||null):null});
  }
  else if(module==='summary')value.page=state.page||0;
  return {sceneId:pack.sceneId,moduleId:module,contentVersion:pack.contentVersion,state:value};
}
export function restoreProgress(pack,module,target,record){
  if(!record?.compatible||!record.state||record.sceneId!==pack.sceneId||record.moduleId!==module)return false;
  if(record.contentVersion!==pack.contentVersion&&!pack.compatibleFrom.includes(record.contentVersion))return false;
  const s=record.state;if(typeof s.practiceId!=='string')return false;
  if(module==='summary'){if(!Number.isInteger(s.page)||s.page<0||s.page>=Math.ceil(pack.modules.summary.length/4))return false;target.page=s.page;}
  else if(module==='lesson'){
    const index=target.steps.findIndex(x=>x.id===s.stepId);if(index<0)return false;
    const step=target.steps[index],kind=step.kind;
    if(!Number.isInteger(s.attempts)||s.attempts<0||s.attempts>100000||typeof s.revealed!=='boolean')return false;
    if(!Array.isArray(s.matched)||new Set(s.matched).size!==s.matched.length||s.matched.some(w=>kind!=='match'||!step.words.includes(w)))return false;
    if(!Number.isInteger(s.roundIndex)||s.roundIndex<0||(kind==='reply'?s.roundIndex>=step.rounds.length:s.roundIndex!==0))return false;
    if(!Array.isArray(s.heard))return false;
    let fragment=0;
    if(kind==='story'){
      const scene=target.pack.modules.story.find(x=>x.id===step.storyId),ids=new Set(scene.segments.map(x=>x.id));
      if(s.heard.some(id=>!ids.has(id)))return false;
      fragment=s.fragmentId===null?scene.segments.length:scene.segments.findIndex(x=>x.id===s.fragmentId);if(fragment<0)return false;
    }else if(s.heard.length||s.fragmentId!==null)return false;
    target.index=index;target.enter();
    if(kind==='story'){target.story.fragment=fragment;target.story.heard=new Set(s.heard);}
    target.attempts=s.attempts;target.revealed=s.revealed;target.matched=new Set(s.matched);target.roundIndex=s.roundIndex;
    target.done=kind==='match'&&step.words.every(w=>target.matched.has(w));
  }
  else{
    const items=module==='story'?pack.modules.story:module==='dialogue'?pack.modules.dialogue:pack.modules.game.questions;
    const index=items.findIndex(x=>x.id===s.stepId);if(index<0)return false;
    if(module==='story'){
      const scene=items[index],ids=new Set(scene.segments.map(x=>x.id));if(!Array.isArray(s.heard)||s.heard.some(id=>!ids.has(id)))return false;
      const fragment=s.fragmentId===null?scene.segments.length:scene.segments.findIndex(x=>x.id===s.fragmentId);if(fragment<0)return false;
      target.step=index;target.fragment=fragment;target.heard=new Set(s.heard);target.saved=s.completed===true;target.pause();
    }else if(module==='dialogue'){
      const option=items[index].options.find(x=>x.id===s.selectedId);if(s.selectedId!==null&&!option)return false;
      if(!Number.isInteger(s.speechIndex)||s.speechIndex<0||s.speechIndex>(option?1+option.followUp.length:0)||s.confirmed&&!option)return false;
      target.index=index;target.selection=s.selectedId;target.done=s.confirmed===true;target.speechIndex=s.speechIndex;target.demo=s.demo===true;target.events=Array.isArray(s.history)?s.history.filter(x=>typeof x.text==='string'):[];
    }else{
      const q=items[index];if(!Array.isArray(s.order)||s.order.length!==q.options.length||new Set(s.order).size!==s.order.length||s.order.some(id=>!q.options.includes(id)))return false;
      if(pack.modules.game.type==='story-order'){if(!Array.isArray(s.sequenceOrder)||new Set(s.sequenceOrder).size!==s.sequenceOrder.length||s.sequenceOrder.some(id=>!q.options.includes(id))||s.sequenceOrder.length>q.options.length||s.selectedId!==(s.sequenceOrder.at(-1)||null))return false;target.sequence=[...s.sequenceOrder];}
      if(!Number.isInteger(s.attempts)||s.attempts<0||s.selectedId!==null&&!q.options.includes(s.selectedId))return false;
      target.index=index;target.selection=s.selectedId;target.orders=new Map([[q.id,[...s.order]]]);target.attempts=s.attempts;target.demoUsed=s.demonstrated===true;target.helpTypes=Array.isArray(s.helpTypes)?s.helpTypes.filter(x=>['instructions','repeat','demo'].includes(x)):[];target.done=s.completed===true;target.finished=s.finished===true;target.heard=false;
    }
  }
  target.practiceId=s.practiceId;return true;
}
