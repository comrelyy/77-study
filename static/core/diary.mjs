import {node,button} from './dom.mjs';
import {mapDays,levelStates} from './route.mjs?v=days-zoo-20261111';
import {renderDayMap} from './day-map.mjs?v=days-zoo-20261111';

const END='Momo 的日记写到这里啦，新的一天还在写';
export function diaryDays(catalog,order,cleared,levels,opts){
  const states=levelStates(order,cleared,opts),days=mapDays(catalog);let at=0;
  return days.map((d,index)=>{// playable levels in no day go on the last page
    const from=at;at=index===days.length-1?order.length:at+d.route.length;const s=states.slice(from,at);
    return {id:d.id,title:d.title,index,levels:levels.slice(from,at),states:s,unlocked:s[0].state!=='locked',done:s.every(x=>x.state==='done')};
  });
}
export function pickDay(days,focusId){
  const hit=days.findIndex(d=>d.levels.some(l=>l.id===focusId));if(hit>=0)return hit;
  const open=days.findIndex(d=>d.unlocked&&!d.done);return open>=0?open:days.length-1;
}
export function shouldTurn(days,focusId){
  const i=days.findIndex(d=>d.levels[0]?.id===focusId);
  return i>0&&days[i-1].done&&days[i].states[0].state==='current';
}
export function renderDiary(root,{days,focusId=null,notice=null,enterScene,playAudio,reduceMotion=false,turnDelay=1200}){
  const tabs=node('div',undefined,'diary-tabs'),page=node('div',undefined,'diary-page'),wrap=node('div',undefined,'diary');
  let turn=null;const label=d=>'第 '+(d.index+1)+' 天 · '+d.title;
  const show=(i,first)=>{
    const d=days[i];
    page.className='diary-page';
    renderDayMap(page,{levels:d.levels,states:d.states,focusId:first&&d.levels.some(l=>l.id===focusId)?focusId:null,notice:first?notice:null,enterScene,playAudio,reduceMotion,heading:label(d),goodnight:i===days.length-1&&d.done?END:undefined});
    tabs.children.forEach(t=>{if(t.dayIndex!==undefined){t.className='diary-tab'+(t.dayIndex===i?' sel':'');t.setAttribute('aria-current',t.dayIndex===i?'true':'false');}});
  };
  const shown=days.map((d,i)=>d.unlocked?i:-1).filter(i=>i>=0);
  for(const i of shown){const b=button(days[i].done?'第 '+(i+1)+' 天 ✓':label(days[i]),()=>{clearTimeout(turn);show(i,false);},'diary-tab');b.dayIndex=i;tabs.append(b);}
  if(shown.length<days.length){const b=button('下一天…',()=>{},'diary-tab diary-next');b.disabled=true;tabs.append(b);}
  if(tabs.children.length>1)wrap.append(tabs);
  wrap.append(page);root.replaceChildren(wrap);
  const at=pickDay(days,focusId);
  if(!reduceMotion&&shouldTurn(days,focusId)){
    show(at-1,false);
    turn=setTimeout(()=>{show(at,true);page.className='diary-page diary-turn';},turnDelay);
  }else show(at,true);
}
