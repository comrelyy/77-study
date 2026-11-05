'use strict';
const {fields,requiredIds,validate}=MomoReview;
const samples=document.querySelector('#samples'),status=document.querySelector('#load-status');
let generation=0,sources={},sampleHashes={},listened=new Set(),urls=[];
function node(tag,text){const e=document.createElement(tag);e.textContent=text;return e;}
async function json(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error(url+' HTTP '+r.status);return r.json();}
async function sha(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');}
function listeningState(){const control=document.querySelector('[name=sampleListeningReviewed]');control.disabled=Object.keys(sampleHashes).length!==10||listened.size!==10;if(control.disabled)control.checked=false;status.textContent='本地文件 '+Object.keys(sampleHashes).length+'/10，完整试听 '+listened.size+'/10。未齐全不能通过样音审阅。';}
async function load(){
  const run=++generation;urls.forEach(URL.revokeObjectURL);urls=[];sources={};sampleHashes={};listened=new Set();samples.replaceChildren();listeningState();
  try{
    const [pack,manifest,sourceManifest]=await Promise.all([json('content/picnic.json'),json('../audio/s1-sample-manifest.json'),json('review-sources.json')]);
    if(run!==generation)return;sources=sourceManifest.sourceHashes;
    for(const id of requiredIds(pack)){
      const asset=pack.assets.find(x=>x.id===id),entry=manifest.entries?.find(x=>x.id===id),row=node('article','');row.className='sample-row';row.append(node('h2',asset.text),node('p',asset.role+' · '+id));samples.append(row);
      try{
        const response=await fetch('../'+asset.path,{cache:'no-store'});if(!response.ok)throw Error('文件尚未生成');const data=await response.arrayBuffer(),hash=await sha(data);if(run!==generation)return;
        const bytes=new Uint8Array(data);if(bytes.length<44||String.fromCharCode(...bytes.slice(0,4))!=='RIFF'||String.fromCharCode(...bytes.slice(8,12))!=='WAVE')throw Error('不是有效WAV');
        if(entry?.sha256!==hash||entry.text!==asset.text||entry.path!==asset.path||entry.role!==asset.role||entry.language!==asset.language)throw Error('清单、文本或文件指纹不符');
        sampleHashes[id]=hash;const url=URL.createObjectURL(new Blob([data],{type:'audio/wav'}));urls.push(url);const audio=document.createElement('audio');audio.controls=true;audio.preload='metadata';audio.src=url;audio.setAttribute('aria-label','试听：'+asset.text);const state=node('p','待完整试听');
        audio.addEventListener('play',()=>samples.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause();}));
        audio.addEventListener('ended',()=>{if(run!==generation)return;listened.add(id);state.textContent='已完整播放，请核对实际听感';listeningState();});
        audio.addEventListener('error',()=>{if(run!==generation)return;delete sampleHashes[id];listened.delete(id);state.textContent='音频解码或播放失败';listeningState();});row.append(audio,state);
      }catch(error){row.append(node('p',error.message));}
    }
    listeningState();
  }catch(error){if(run===generation)status.textContent='审阅材料未齐全：'+error.message+'。先生成样音，不能将此状态登记为通过。';}
}
document.querySelector('#reload').addEventListener('click',load);
document.querySelector('#review-form').addEventListener('submit',event=>{
  event.preventDefault();const record={stage:'S1',schemaVersion:1,reviewer:document.querySelector('#reviewer').value.trim(),reviewedAt:new Date().toISOString(),contentVersion:'0.1.0',
    checks:Object.fromEntries(fields.map(key=>[key,document.querySelector('[name='+key+']').checked])),sourceRightsEvidence:document.querySelector('#rights').value.trim(),notes:document.querySelector('#notes').value,
    sourceHashes:sources,sampleHashes,listenedIds:[...listened]};
  record.errors=validate(record,{sourceHashes:sources,sampleHashes});record.status=record.errors.length?'incomplete':'passed';document.querySelector('#result').textContent=JSON.stringify(record,null,2);
  const url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='momoplanet-s1-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
window.addEventListener('pagehide',()=>{generation++;urls.forEach(URL.revokeObjectURL);samples.querySelectorAll('audio').forEach(a=>a.pause());});
document.addEventListener('visibilitychange',()=>{if(document.hidden)samples.querySelectorAll('audio').forEach(a=>a.pause());});
load();
