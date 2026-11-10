import {availableScenes} from './catalog.mjs';
export function routeOrder(catalog){
  const open=availableScenes(catalog),ids=(catalog.route||[]).map(r=>r.id);
  return [...ids.filter(id=>open.includes(id)),...open.filter(id=>!ids.includes(id))];
}
export function levelStates(order,cleared,{unlockAll=false}={}){
  let seen=false;
  return order.map(id=>{if(cleared.has(id))return {id,state:'done'};if(unlockAll||!seen){seen=true;return {id,state:'current'};}return {id,state:'locked'};});
}
export const canEnter=(order,cleared,id,opts)=>levelStates(order,cleared,opts).some(l=>l.id===id&&l.state!=='locked');
