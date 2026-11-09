import {loadReviewSources} from './core/review-sources.mjs?v=themes-20261031';
import {App} from './core/app.mjs?v=lesson-20261110';
import {renderThemeSelection} from './core/theme-selection.mjs?v=theme-page-20261031';
import {MemoryStore} from './core/store.mjs';
import {PersistentStore} from './core/persistent-store.mjs?v=reload-handover-20261103';
import {BrowserActivity} from './core/browser-activity.mjs?v=reload-handover-20261103';
import {node,button} from './core/dom.mjs';
import {missingBootAssets} from './core/boot-assets.mjs';
import {chooseScene,availableScenes} from './core/catalog.mjs?v=themes-20261031';
async function json(path){const response=await fetch(path,{cache:'no-store'});if(!response.ok)throw Error('内容文件读取失败');return response.json();}
async function loadPack(catalog,id){
  const path=Object.hasOwn(catalog.scenes,id)?catalog.scenes[id]:null;
  if(!/^content\/[a-z0-9-]+\.json$/.test(path||''))throw Error('Invalid content path');
  const pack=await json(path);if(pack.sceneId!==id)throw Error('Content ID mismatch');
  const validation=MomoPrototype.validate(pack,{strict:catalog.mode==='release'});if(validation.errors.length)throw Error(validation.errors.join('; '));
  return pack;
}
async function boot(){
  const root=document.querySelector('#app');
  try{
    const catalog=await json('content/catalog.json'),query=new URLSearchParams(location.search);
    const navigateScene=id=>{const url=new URL(location.href);url.searchParams.delete('dev');url.searchParams.delete('scene');if(id!==null)url.searchParams.set('scene',id);location.assign(url.href);};
    const loadOptions=async()=>{
      const results=await Promise.allSettled(availableScenes(catalog).map(async id=>{
        const p=await loadPack(catalog,id),illustration=p.assets.find(a=>a.id===p.words[0].image);
        return {id,title:p.title,image:illustration.path,description:p.words.map(word=>word.cn).join(' · ')};
      }));
      return results.filter(result=>result.status==='fulfilled').map(result=>result.value);
    };
    if(!query.has('dev')&&!query.has('scene')){
      document.querySelector('#records').hidden=true;document.querySelector('#stickers').hidden=true;
      renderThemeSelection(root,await loadOptions(),navigateScene);return;
    }
    const selected=chooseScene(catalog,query.get('dev'),query.get('scene'));
    const pack=await loadPack(catalog,selected.id);
    if(!selected.internal){if((await missingBootAssets(pack,async path=>(await fetch(path,{method:'HEAD'})).ok)).length)throw Error('主题本地图片或声音不完整');}
    if(catalog.mode==='development'){const notice=node('p',selected.internal?'内部演示 · 记录仅保留在本页':'开发体验版 · 不限体验时长，使用时间与记录由本机保存','migration-banner');document.body.insertBefore(notice,root);}
    const scenes=selected.internal?[]:await loadOptions();
    const player=new MomoAudio.Player({fallback:(text,done,rate=1)=>{if(!('speechSynthesis'in window)){done(false);return ()=>{};}const u=new SpeechSynthesisUtterance(text);u.lang=/[\u3400-\u9fff]/.test(text)?'zh-CN':'en-US';u.rate=.8*rate;u.onend=()=>done(true);u.onerror=()=>done(false);speechSynthesis.speak(u);return ()=>speechSynthesis.cancel();}});
    const app=new App({root,pack,scenes,navigateScene,reviewLoader:events=>loadReviewSources({catalog,current:pack,events,internal:selected.internal,validate:(...args)=>MomoPrototype.validate(...args)}),store:selected.internal?new MemoryStore():new PersistentStore({activity:new BrowserActivity()}),player});
    app.limitsEnabled=catalog.mode!=='development';await app.init();
    document.querySelector('#records').addEventListener('click',()=>app.records());document.querySelector('#stickers').addEventListener('click',()=>app.stickers());
    document.querySelector('header a').addEventListener('click',event=>{event.preventDefault();app.selectScene(null);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)app.suspend();else app.last=Date.now();});window.addEventListener('pagehide',()=>app.pageHide());window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});setInterval(()=>app.tick(document.hidden),1000);
  }catch(error){
    root.replaceChildren(node('h1','暂时无法打开这段小发现'),node('p',error.code==='upgrade_required'?'请大人重新启动本机服务，再打开页面。':'请大人检查本机服务或内容文件。'),button('重新加载',()=>location.reload()));
    const details=node('details',undefined,'notice');details.append(node('summary','给大人的错误详情'),node('pre',String(error?.name||'Error')+': '+String(error?.message||'未知错误')+(error?.code?'\n错误编号：'+error.code:'')));root.append(details);console.error(error);
  }
}
if(typeof document!=='undefined'&&document.querySelector('#app'))boot();
