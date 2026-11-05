'use strict';
let latest=null,run=0;
async function inspect(){
  const token=++run;
  const ua=navigator.userAgent,target=MomoBrowserTarget.detect(ua);
  let service=false,reason='';
  try{const response=await fetch('/api/state',{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);const state=await response.json();service=Array.isArray(state.events)&&typeof state.seconds==='number';if(!service)reason='服务响应结构不符';}catch(error){reason=error.message;}
  if(token!==run)return;
  const checks={windows:target.windows,chrome:target.chrome,zoom100Confirmed:document.querySelector('#zoom').checked,
   stableChannelConfirmed:document.querySelector('#stable').checked,mouseConfirmed:document.querySelector('#mouse').checked,
   viewport:innerWidth>=1280&&innerHeight>=720,service};
  latest={stage:'S0',schemaVersion:1,capturedAt:new Date().toISOString(),
    source:'local browser measurement and explicit operator confirmations',
    environment:{userAgent:ua,browser:target.browser,browserVersion:target.version,
      viewport:{width:innerWidth,height:innerHeight},screen:{width:screen.width,height:screen.height},devicePixelRatio,
      zoom:'not inferred from devicePixelRatio'},checks,serviceError:reason,
    status:Object.values(checks).every(x=>x===true)?'passed':'incomplete'};
  document.querySelector('#report').textContent=JSON.stringify(latest,null,2);
  document.querySelector('#status').textContent=latest.status==='passed'?'环境项已齐全；仍需与自动检查结果合并后判定 S0。':'尚未满足：'+Object.entries(checks).filter(([,value])=>!value).map(([name])=>name).join('、');
}
document.querySelector('#inspect').addEventListener('click',inspect);
for(const input of document.querySelectorAll('input'))input.addEventListener('change',inspect);
window.addEventListener('resize',inspect);
document.querySelector('#copy').addEventListener('click',async()=>{await inspect();try{await navigator.clipboard.writeText(JSON.stringify(latest,null,2));document.querySelector('#status').textContent='已复制本机环境结果，可粘贴到本次对话用于登记。';}catch{document.querySelector('#status').textContent='自动复制失败，请选中下方结果手动复制。';}});
document.querySelector('#download').addEventListener('click',async()=>{await inspect();const url=URL.createObjectURL(new Blob([JSON.stringify(latest,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='momoplanet-s0-environment.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
inspect();
