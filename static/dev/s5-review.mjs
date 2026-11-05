const $=id=>document.getElementById(id),status=$('status');
try{
  const response=await fetch('s5-manifest.json',{cache:'no-store'});if(!response.ok)throw Error('请先在项目目录运行 node s5-release.cjs 生成版本清单。');
  const manifest=await response.json(),key='momo.s5.review.'+manifest.fingerprint;
  for(const text of manifest.blockers){const li=document.createElement('li');li.textContent=text;$('blockers').append(li);}
  let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}');}catch{}
  for(const item of manifest.matrix){
    const label=document.createElement('label');label.textContent=item.label;
    const select=document.createElement('select');select.id=item.id;
    for(const [value,text]of [['pending','未测试'],['passed','已实测通过'],['failed','实测失败'],['blocked','条件不足']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
    const note=document.createElement('textarea');note.id=item.id+'Note';note.setAttribute('aria-label',item.label+'：步骤、结果与证据');note.placeholder='记录实际步骤、结果或阻断原因';label.append(select,note);$('matrix').append(label);
  }
  const fields=[...document.querySelectorAll('input,select,textarea')];
  for(const field of fields)if(Object.hasOwn(saved,field.id)){if(field.type==='checkbox')field.checked=saved[field.id]===true;else field.value=saved[field.id];}
  $('review').hidden=false;status.textContent='当前版本 '+manifest.fingerprint.slice(0,12)+'；草稿只保存在本浏览器。';
  $('review').addEventListener('input',()=>{try{const draft=Object.fromEntries(fields.map(f=>[f.id,f.type==='checkbox'?f.checked:f.value]));localStorage.setItem(key,JSON.stringify(draft));}catch{status.textContent='浏览器未保存草稿，请下载记录。';}});
  $('review').addEventListener('submit',event=>{
    event.preventDefault();
    const report={stage:'S5',fingerprint:manifest.fingerprint,capturedAt:new Date().toISOString(),environment:{userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight},chromeStable:$('chromeStable').checked,zoom100:$('zoom100').checked,mouse:$('mouse').checked},results:Object.fromEntries(manifest.matrix.map(i=>[i.id,{status:$(i.id).value,note:$(i.id+'Note').value}])),familyTrial:{status:$('trialState').value,independence:$('independence').value,friction:$('friction').value,feedback:$('feedback').value}};
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='momoplanet-s5-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='已导出实际填写结果。报告导出不代表发布验收通过。';
  });
}catch(error){status.textContent=error.message;}
