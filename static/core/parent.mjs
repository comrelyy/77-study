import {node,button} from './dom.mjs';
export async function openParent(app){
  await app.home();if(app.failure)return;app.view='parent';app.draw();
  const panel=node('section',undefined,'notice parent-panel');app.root.append(panel);
  const store=app.store,status=node('p','');status.setAttribute('role','status');
  const state=await store.request('state');let heard=false,codePending=false;
  const field=(text,type='password')=>{const label=node('label',text),input=node('input');input.type=type;input.autocomplete='off';label.append(input);panel.append(label);return input;};
  const action=(text,fn)=>panel.append(button(text,async()=>{panel.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){status.textContent=e.message;}finally{panel.querySelectorAll('button').forEach(b=>b.disabled=false);}}));
  const code=result=>{codePending=true;const box=node('section',undefined,'notice');box.append(node('h2','请妥善保存恢复码'),node('p','此码只显示一次；使用后旧码失效，额度与历史保留。'),node('code',result.recoveryCode),button('我已保存恢复码',()=>{codePending=false;box.remove();}));panel.append(box);};
  panel.append(node('h1','家长准备与设置'),node('p','声音检查不产生参与记录，不消耗活动额度。'));
  action('播放本地测试声音',async()=>{const a=app.pack.assets.find(a=>a.kind==='audio');heard=await app.player.play(a.path,a.text,{allowFallback:false});status.textContent=heard?'播放结束，请确认是否听清。':'声音不可用，请检查音量与本地资源。';});
  panel.append(button('暂停声音',()=>{heard=false;app.pause();}));
  const pin=field(state.settings.pinConfigured?'输入家长 PIN':'设置四位数字 PIN');pin.maxLength=4;pin.inputMode='numeric';
  if(!state.settings.pinConfigured){const repeat=field('再次输入 PIN');repeat.maxLength=4;action('设置 PIN 并生成恢复码',async()=>{if(pin.value!==repeat.value)throw Error('两次 PIN 不一致');code(await store.request('pin/setup',{pin:pin.value}));pin.value=repeat.value='';});}
  else{
    const segment=field('单段分钟（仅下调，1–8）','number'),daily=field('每日分钟（仅下调，1–15）','number');segment.value=state.settings.segmentSeconds/60;daily.value=state.settings.dailySeconds/60;
    action('立即下调时长',async()=>{app.applyState(await store.request('limits/lower',{pin:pin.value,segmentSeconds:Number(segment.value)*60,dailySeconds:Number(daily.value)*60}));status.textContent='已立即生效，保留已用时间。';});
    action('授权新单段',async()=>{app.applyState(await store.request('segment/new',{pin:pin.value}));status.textContent='新单段已授权，每日上限保留。';});
    action('导出家庭记录',async()=>{const data=await store.request('data/export',{pin:pin.value}),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=node('a','下载记录 JSON');a.href=url;a.download='momoplanet-records.json';panel.append(a);a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);});
    panel.append(node('p','清除不可撤销，会删除服务中的历史、进度、贴纸和额度。保留 PIN 与时长设置。历史备份和导出文件需自行管理。'));
    const confirm=field('输入“清除全部记录”进行二次确认','text');
    action('确认清除全部记录',async()=>{if(store.entries().length)throw Error('请先核对待确认记录');await store.request('data/clear',{pin:pin.value,confirmation:confirm.value});location.reload();});
  }
  const recovery=field('忘记 PIN：恢复码'),newPin=field('重设四位 PIN');newPin.maxLength=4;
  action('使用恢复码重设',async()=>{code(await store.request('pin/recover',{recoveryCode:recovery.value,newPin:newPin.value}));recovery.value=newPin.value='';});
  action('声音听清了，进入首页',async()=>{if(!heard)throw Error('请先播放并确认听清本地声音');const s=await store.request('state');if(!s.settings.pinConfigured||codePending)throw Error('请先设置 PIN 并确认保存恢复码');app.data.settings=s.settings;store.storage.setItem('momo.sound.checked','1');await app.home();});panel.append(status);
}
