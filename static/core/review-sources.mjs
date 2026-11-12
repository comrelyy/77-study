import {reviewWords} from './enhancements.mjs';

import {availableScenes} from './catalog.mjs?v=diary-tabs-20261112';
// Review is restricted to published content and explicitly listed development previews.
// Internal examples never become family review sources.
export async function loadReviewSources({catalog,current,events,internal=false,fetcher=(...args)=>globalThis.fetch(...args),validate}){
  const packs=[current],available=new Set();
  const allowed=new Set(internal?[current.sceneId]:availableScenes(catalog));
  const ids=[...new Set(events.filter(e=>e.kind==='introduced').map(e=>e.payload?.sceneId))];
  for(const id of ids){
    if(id===current.sceneId||!allowed.has(id))continue;
    const path=Object.hasOwn(catalog.scenes,id)?catalog.scenes[id]:null;
    if(!/^content\/[a-z0-9-]+\.json$/.test(path||''))continue;
    try{
      const r=await fetcher(path,{cache:'no-store'});if(!r.ok)continue;
      const pack=await r.json();
      if(pack.sceneId!==id||validate(pack,{strict:catalog.mode==='release'}).errors.length)continue;
      packs.push(pack);
    }catch{/* An unavailable historical scene must not block the current activity. */}
  }
  const paths=new Set();
  for(const pack of packs)for(const word of pack.words)for(const id of [word.audio,word.image]){
    const path=pack.assets.find(a=>a.id===id)?.path;
    if(typeof path==='string'&&/^(?:audio|illustrations)\/[a-zA-Z0-9_./-]+$/.test(path)&&!path.split('/').includes('..'))paths.add(path);
  }
  await Promise.all([...paths].map(async path=>{try{if((await fetcher(path,{method:'HEAD',cache:'no-store'})).ok)available.add(path);}catch{}}));
  return {packs,available};
}

export function reviewCandidates(app){
  return reviewWords(app.data.events,app.reviewPacks||[app.pack],path=>app.availableReviewAssets?.has(path));
}

export async function hearReview(app,{word,pack}){
  if(app.busy||app.failure||app.store.blocked||!app.allowed()||app.view!=='module'||app.moduleId!=='summary')return false;
  if(!reviewCandidates(app).some(x=>x.word===word&&x.pack===pack))return false;
  const asset=pack.assets.find(a=>a.id===word.audio),generation=app.generation;
  app.pause();app.message('正在重听 '+word.text+'，随时可以暂停或结束。');
  const ok=await app.player.play(asset.path,asset.text,{allowFallback:false});
  if(generation!==app.generation)return false;
  app.message(ok?'重听完啦，可以跳过或继续。':'声音暂停或不可用，可以跳过或结束。');
  return ok;
}
