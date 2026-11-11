import {node,button,image} from './dom.mjs';
import {flatRoute} from './route.mjs';

const BANDS=['清晨','上午','中午','下午','傍晚','晚上'];
const WHERE={done:'走过啦，可以再玩一次',current:'下一站',locked:'先走完前面的路才能来'};
const GO={done:'再玩一次',current:'出发',locked:'还没解锁'};
const GOODNIGHT='晚安，Momo。今天的路都走完啦！';
const SPEAKER='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M18.5 6.5a8 8 0 0 1 0 11"/></svg>';
const LOCK='<svg viewBox="-10 -12 20 26"><path d="M-6 0v-5a6 6 0 0 1 12 0v5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="-8" y="0" width="16" height="12" rx="3" fill="#fffaf0" stroke="currentColor" stroke-width="2"/></svg>';
const STAR='<svg viewBox="-12 -1 24 24"><path d="M0 0l5 10l11 1l-8 7l3 11l-11-6l-11 6l3-11l-8-7l11-1z" transform="scale(.75)" fill="#ebcd83" stroke="#8b7965" stroke-width="1.6"/></svg>';

// Cleared = server events plus cleared operations still waiting in the local pending queue.
export function clearedFrom(snapshot,pendingOps=[]){
  const ids=new Set();
  for(const e of [...(snapshot?.events||[]),...(pendingOps||[])])if(e?.kind==='cleared'&&typeof e.payload?.sceneId==='string')ids.add(e.payload.sceneId);
  return ids;
}

export function mapLevels(order,catalog,packs){
  const route=new Map(flatRoute(catalog).map(r=>[r.id,r])),learned=new Set();
  return order.map(id=>{
    const pack=packs[id];
    if(!pack)return {id,title:route.get(id)?.title||id,band:route.get(id)?.band??0,icon:route.get(id)?.icon?'illustrations/'+route.get(id).icon+'.svg':null,unavailable:true,bridge:null,review:[],words:[]};
    const path=asset=>pack.assets.find(a=>a.id===asset)?.path||null,step=pack.lesson?.steps?.find(s=>s.kind==='words');
    const own=(step?.words||pack.words.map(w=>w.id)).map(wid=>pack.words.find(w=>w.id===wid)).filter(Boolean);
    const words=own.map(w=>({text:w.text,image:path(w.image),seen:learned.has(w.text)}));
    for(const w of own)learned.add(w.text);
    const bridge=pack.lesson?.bridge;
    return {id,title:pack.title.replace(/^和\s*Momo\s*/,''),band:route.get(id)?.band??0,
      icon:route.get(id)?.icon?'illustrations/'+route.get(id).icon+'.svg':words[0]?.image,
      bridge:bridge?{text:bridge.text,cn:bridge.cn,audio:path(bridge.audio)}:null,
      review:(step?.review||[]).map(r=>({text:r.text,cn:r.cn,image:path(r.image),from:r.from})),words};
  });
}

// Same layout as the approved prototype: 3 snake rows of 5 (desktop), vertical zig-zag (narrow).
// Desktop rows sit 40 units lower than the prototype (viewBox 1000x700) so the bubble fits above row 1.
function geometry(count,narrow){
  if(narrow){const step=104;return {W:380,H:140+count*step+40,narrow,R:34,momo:54,home:[190,64],homeEnd:null,pts:Array.from({length:count},(_,i)=>[i%2?262:118,170+i*step])};}
  const xs=[175,340,505,670,835],pts=Array.from({length:count},(_,i)=>{const r=Math.floor(i/5),c=i%5;return [xs[r%2?4-c:c],([190,385,575][r]??575+190*(r-2))+(c%2?16:-8)];});
  const last=pts[pts.length-1]||[62,168],dir=Math.floor((count-1)/5)%2?-1:1;
  return {W:1000,H:Math.max(700,last[1]+113),narrow,R:38,momo:70,home:[62,168],homeEnd:[last[0]+195*dir,last[1]+13],pts};
}
function smooth(p){
  if(p.length<2)return '';let d='M'+p[0].join(' ');
  for(let i=0;i<p.length-1;i++){const a=p[i-1]||p[i],b=p[i],c=p[i+1],e=p[i+2]||c;
    d+=' C'+(b[0]+(c[0]-a[0])/6).toFixed(1)+' '+(b[1]+(c[1]-a[1])/6).toFixed(1)+' '+(c[0]-(e[0]-b[0])/6).toFixed(1)+' '+(c[1]-(e[1]-b[1])/6).toFixed(1)+' '+c[0]+' '+c[1];}
  return d;
}
function house(x,y,night){return '<g transform="translate('+x+' '+y+')" filter="url(#map-wob)" stroke="#8b7965" stroke-width="2" fill="none"><path d="M-30 6 L0 -22 L30 6"/><rect x="-22" y="4" width="44" height="34" fill="#fffaf0"/><rect x="-6" y="18" width="12" height="20"/><rect x="10" y="11" width="9" height="9" fill="'+(night?'#f6d98e':'none')+'"/></g>';}
function label(x,y,text,anchor='middle'){return '<text x="'+x+'" y="'+y+'" text-anchor="'+anchor+'" font-family="KaiTi,STKaiti,Kaiti SC,serif" font-size="15" fill="#8b7965">'+text+'</text>';}
// Decorative only: pencil road, walked (green) part, watercolour washes, home and the night corner.
function drawing(g,levels,states,rec,all){
  const {W,H,pts}=g,P=[g.home,...pts],tail=g.homeEnd?[...P,g.homeEnd]:P,end=all?pts.length-1:rec;
  let s='<svg viewBox="0 0 '+W+' '+H+'" aria-hidden="true" focusable="false"><defs>'+
    '<filter id="map-wob"><feTurbulence type="fractalNoise" baseFrequency=".04" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="2.6"/></filter>'+
    '<filter id="map-wash" x="-40%" y="-40%" width="180%" height="180%"><feTurbulence type="fractalNoise" baseFrequency=".022" numOctaves="3" seed="8"/><feDisplacementMap in="SourceGraphic" scale="34"/><feGaussianBlur stdDeviation="5"/></filter></defs>';
  pts.forEach((p,i)=>{const o=states[i].state==='done'?.55:i===rec?.32:0;if(o)s+='<circle cx="'+p[0]+'" cy="'+p[1]+'" r="'+(g.narrow?70:84)+'" fill="var(--map-b'+levels[i].band+')" opacity="'+o+'" filter="url(#map-wash)"/>';});
  if(all&&g.narrow){const p=pts[pts.length-1];s+=[[-60,-70],[40,-88],[90,-40],[-100,-20]].map(([dx,dy])=>'<text x="'+(p[0]+dx)+'" y="'+(p[1]+dy)+'" font-size="16" fill="#ebcd83">✦</text>').join('');}
  const road=smooth(tail);
  s+='<path d="'+road+'" fill="none" stroke="#b9ab91" stroke-width="16" stroke-linecap="round" opacity=".35" filter="url(#map-wob)"/>';
  s+='<path d="'+road+'" fill="none" stroke="#8b7965" stroke-width="2.2" stroke-dasharray="7 9" stroke-linecap="round" filter="url(#map-wob)"/>';
  if(end>=0)s+='<path class="map-trail" d="'+smooth(P.slice(0,end+2))+'" fill="none" stroke="#77876a" stroke-width="5" stroke-linecap="round" opacity=".85" filter="url(#map-wob)"/>';
  if(rec>0)s+='<path class="map-trail-before" d="'+smooth(P.slice(0,rec+1))+'" fill="none" stroke="none"/>';
  s+=house(g.home[0],g.home[1],false)+(g.narrow?label(g.home[0]+40,g.home[1]+30,'Momo 家','start'):label(g.home[0],g.home[1]+58,'Momo 家'));
  if(g.homeEnd){const [x,y]=g.homeEnd;
    s+='<circle cx="'+(x+40)+'" cy="'+(y-10)+'" r="120" fill="var(--map-b5)" opacity="'+(all?.35:0)+'" filter="url(#map-wash)"/>'+house(x+40,y-6,all)+
      '<g transform="translate('+(x+190)+' '+(y-70)+')" filter="url(#map-wob)"><path d="M14 -22 A24 24 0 1 0 14 22 A18 18 0 1 1 14 -22z" fill="'+(all?'#ebcd83':'none')+'" stroke="#8b7965" stroke-width="2"/></g>'+label(x+40,y+56,'回家睡觉');}
  return s+'</svg>';
}

export function renderDayMap(root,{levels,states,focusId=null,notice=null,enterScene,playAudio,reduceMotion=false}){
  const all=states.length>0&&states.every(s=>s.state==='done'),rec=states.findIndex(s=>s.state==='current');
  const focus=levels.findIndex(l=>l.id===focusId);let sel=focus>=0?focus:rec>=0?rec:levels.length-1;
  const done=states.filter(s=>s.state==='done').length;
  const head=node('div',undefined,'map-head'),title=node('div');
  title.append(node('h1','Momo 的一天'),node('p','陪 Momo 从早上走到晚上，一站一站往前走'));
  const progress=node('div','已走过 ','map-progress');progress.append(node('b',String(done)),node('span',' / '+levels.length+' 站'));
  head.append(title,progress);
  const sheet=node('div',undefined,'map-sheet'),card=node('aside',undefined,'map-card'),layout=node('div',undefined,'map-layout');
  card.setAttribute('aria-live','polite');layout.append(sheet,card);
  const page=node('section',undefined,'day-map');page.append(head);
  if(notice)page.append(node('p',notice,'map-notice'));
  page.append(layout);root.replaceChildren(page);

  const chip=(word,note,extra='')=>{const e=node('span',undefined,'map-word'+extra);if(word.image)e.append(image(word.image,'','map-word-icon'));e.append(node('span',word.text,'map-word-en'));if(note)e.append(node('small',note));return e;};
  function drawCard(){
    const lv=levels[sel],st=states[sel].state,words=node('div',undefined,'map-words');
    words.append(...lv.words.map(w=>chip(w,w.seen?'见过':'',w.seen?' seen':'')));
    let review=node('p','第一站，还没有学过的词','map-empty');
    if(lv.review.length){review=node('div',undefined,'map-words');review.append(...lv.review.map(r=>chip(r,r.from)));}
    const off=st==='locked'||lv.unavailable,go=button(lv.unavailable?'暂时打不开':GO[st],()=>{if(!off)enterScene(lv.id);},'map-go'+(off?'':' primary'));go.disabled=off;
    card.replaceChildren(node('p','第 '+(sel+1)+' 站 · '+BANDS[lv.band]+' · '+(lv.unavailable?'这一站暂时打不开':WHERE[st]),'map-where'),node('h2',lv.title),node('h3','先复习学过的词'),review,node('h3','这一站的词'),words,go);
  }

  let g,buttons=[],momo,bubble,walking=false;
  const pct=(v,of)=>(v/of*100).toFixed(3)+'%';
  function momoAt(x,y){momo.style.left=pct(x-g.momo*1.05,g.W);momo.style.top=pct(y-g.momo*.35,g.H);}
  function placeBubble(){
    if(!bubble||!sheet.clientWidth)return;// needs a real layout
    const p=all?(g.homeEnd||g.pts[g.pts.length-1]):g.pts[rec],sx=sheet.clientWidth/g.W,left=p[0]*sx;
    bubble.style.maxWidth='';
    if(g.narrow){const right=p[0]<g.W/2,R=(g.R+6)*sx;bubble.className='map-bubble side'+(all?' map-goodnight':'');
      bubble.style.maxWidth=Math.floor(right?sheet.clientWidth-left-R-14:left-R-14)+'px';
      bubble.style.left=(right?left+R:left-R-bubble.offsetWidth)+'px';bubble.style.top=(p[1]*sx-bubble.offsetHeight/2+20)+'px';return;}
    if(all){const l=(p[0]+76)*sx;bubble.className='map-bubble map-goodnight side';bubble.style.maxWidth=Math.floor(sheet.clientWidth-l-10)+'px';bubble.style.left=l+'px';bubble.style.top=(p[1]-48)*sx+'px';return;}// right of the night house, under the moon
    const bw=Math.min(bubble.offsetWidth,sheet.clientWidth-16),bl=Math.max(8,Math.min(left-bw/2,sheet.clientWidth-bw-8));
    bubble.className='map-bubble';bubble.style.left=bl+'px';bubble.style.top=Math.max(6,(p[1]-g.R-14)*sx-bubble.offsetHeight-8)+'px';
    bubble.style.setProperty('--tail',Math.max(14,Math.min(bw-28,left-bl-7))+'px');
  }
  function drawMap(){
    g=geometry(levels.length,!!sheet.clientWidth&&sheet.clientWidth<620);
    sheet.className='map-sheet'+(g.narrow?' narrow':'');sheet.style.aspectRatio=g.W+' / '+g.H;
    const art=node('div',undefined,'map-art');art.innerHTML=drawing(g,levels,states,rec,all);
    buttons=levels.map((lv,i)=>{
      const st=states[i].state,b=button('',()=>{if(walking)return;sel=i;for(const [k,x] of buttons.entries())x.className='map-level'+(k===sel?' sel':'');drawCard();if(g.narrow)card.scrollIntoView?.({block:'end',behavior:reduceMotion?'instant':'smooth'});},'map-level'+(i===sel?' sel':''));
      b.setAttribute('data-state',st);b.setAttribute('aria-label','第'+(i+1)+'站 '+lv.title+'，'+{done:'已走过',current:'下一站',locked:'还没解锁'}[st]);
      b.style.left=pct(g.pts[i][0],g.W);b.style.top=pct(g.pts[i][1],g.H);b.style.setProperty?.('--map-band','var(--map-b'+lv.band+')');
      const ring=node('span',undefined,'map-ring');if(lv.icon)ring.append(image(lv.icon,'','map-icon'));
      if(st!=='current'){const mark=node('span',undefined,st==='done'?'map-star':'map-lock');mark.innerHTML=st==='done'?STAR:LOCK;ring.append(mark);}
      b.append(ring,node('span',lv.title,'map-level-title'),node('span',(i+1)+' · '+BANDS[lv.band],'map-level-time'));return b;
    });
    momo=image('illustrations/momo.svg','','map-momo');momo.style.width=pct(g.momo,g.W);
    const at=all?(g.homeEnd||g.pts[g.pts.length-1]):g.pts[Math.max(rec,0)];momoAt(at[0],at[1]);
    bubble=null;const bridge=all?null:levels[rec]?.bridge;
    if(all)bubble=node('div',GOODNIGHT,'map-bubble map-goodnight');
    else if(bridge){bubble=node('div',undefined,'map-bubble');const speak=button('',()=>playAudio(bridge.audio),'map-speak');speak.setAttribute('aria-label','听这句');speak.innerHTML=SPEAKER;
      bubble.append(node('span',bridge.text,'map-en'),speak,node('span',bridge.cn,'map-cn'));}
    sheet.replaceChildren(art,...buttons,momo,...(bubble?[bubble]:[]));placeBubble();
  }
  // The single animation: Momo walks from the level just cleared to the recommended one.
  function walk(){
    const trail=sheet.querySelector?.('.map-trail'),before=sheet.querySelector?.('.map-trail-before');
    if(reduceMotion||typeof requestAnimationFrame!=='function'||!trail?.getPointAtLength||!before)return;
    const a=before.getTotalLength(),b=trail.getTotalLength(),t0=performance.now(),dur=1100;walking=true;momoAt(...g.pts[rec-1]);if(bubble)bubble.style.opacity=0;
    const step=t=>{const k=Math.min(1,(t-t0)/dur),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2,pt=trail.getPointAtLength(a+(b-a)*e);
      momoAt(pt.x,pt.y-Math.abs(Math.sin(k*Math.PI*6))*4);
      if(k<1)requestAnimationFrame(step);else{walking=false;if(bubble)bubble.style.opacity='';}};
    requestAnimationFrame(step);
  }
  drawMap();drawCard();
  // Narrow: the route is ~1500px tall, so bring the selected level to the middle of the screen.
  if(g.narrow)buttons[sel]?.scrollIntoView?.({block:'center',behavior:'instant'});
  if(focus>=0&&focus===rec&&rec>0&&states[rec-1].state==='done')walk();
  if(typeof window!=='undefined')window.addEventListener('resize',()=>{if(walking)return;const narrow=sheet.clientWidth<620;if(narrow!==g.narrow)drawMap();else placeBubble();});
}
