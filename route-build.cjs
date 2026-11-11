const bridges=require('./route-bridges.cjs');
// Review = 3 earlier words this level does not teach itself, nearest learned first (first-seen order, from the end).
function routeLinks(catalog,packsById,extraBridges={}){
  const out={},history=[],key=w=>w.text.toLowerCase();
  for(const {id} of (catalog.days||[]).flatMap(d=>d.route)){
    const pack=packsById[id];if(!pack)continue;
    const bridge=bridges[id]||extraBridges[id],own=pack.modules.summary.map(wid=>pack.words.find(w=>w.id===wid)).filter(Boolean),ownKeys=new Set(own.map(key));
    const review=[],seen=new Set();
    for(let i=history.length-1;i>=0&&review.length<3;i--){const h=history[i];if(!ownKeys.has(h.key)&&!seen.has(h.key)){seen.add(h.key);review.push({wordId:h.wordId,sceneId:h.sceneId});}}
    out[id]={bridge:bridge?{text:bridge.text,cn:bridge.cn}:null,review};
    for(const w of own)if(!history.some(h=>h.key===key(w)))history.push({key:key(w),wordId:w.id,sceneId:id});
  }
  return out;
}
function lessonLink(catalog,packsById,sceneId,extraBridges={}){
  const link=routeLinks(catalog,packsById,extraBridges)[sceneId];if(!link)return null;
  const packs={};for(const r of link.review)packs[r.sceneId]=packsById[r.sceneId];
  return {...link,packs};
}
module.exports={routeLinks,lessonLink};
