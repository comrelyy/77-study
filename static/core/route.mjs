import {availableScenes} from './catalog.mjs?v=days-zoo-20261111';
export const flatRoute=catalog=>(catalog.days||[]).flatMap(d=>d.route.map(r=>({...r,dayId:d.id})));
export function mapDays(catalog){
  const open=availableScenes(catalog);
  return (catalog.days||[]).filter(d=>d.approved===true).map(d=>({id:d.id,title:d.title,route:d.route.filter(r=>open.includes(r.id))})).filter(d=>d.route.length);
}
export function routeOrder(catalog){
  const open=availableScenes(catalog),ids=mapDays(catalog).flatMap(d=>d.route.map(r=>r.id)),all=flatRoute(catalog).map(r=>r.id);
  return [...ids,...open.filter(id=>!all.includes(id))];
}
export function levelStates(order,cleared,{unlockAll=false}={}){
  let seen=false;
  return order.map(id=>{if(cleared.has(id))return {id,state:'done'};if(unlockAll||!seen){seen=true;return {id,state:'current'};}return {id,state:'locked'};});
}
export const canEnter=(order,cleared,id,opts)=>levelStates(order,cleared,opts).some(l=>l.id===id&&l.state!=='locked');
