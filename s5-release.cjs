const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {inspectScenes}=require('./release-scenes.cjs');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const matrix=[
  ['layout','Chrome桌面及窄屏布局、鼠标、键盘焦点与按钮可达'],
  ['audio','四模块本地声音、暂停继续、文本一致、音量语速及素材来源'],
  ['background','切到后台立即停止声音和计时，回来不自动播放'],
  ['close','异常关页后恢复已确认进度，未确认项有明确提示'],
  ['midnight','隔离测试库跨日记录正确，设备日期倒退有提示'],
  ['multiTab','两个页面同时活动受到约束，旧页面不能继续提交'],
  ['failure','隔离服务断线、响应丢失、重试不重复记录'],
  ['offline','断开外网但保留本机服务，四模块声音与玩法可用'],
  ['unlimited','开发模式超过8分钟及15分钟仍能进入四模块并保存回答'],
  ['exit','任意环节随时退出，立即停声且真实保存，不自动进入下一模块']
].map(([id,label])=>({id,label}));
function fingerprint(){
  const files=['app.py','storage_v3.py','static/index.html','static/main.mjs','static/s2.css','s5-release.cjs','release-scenes.cjs','audio-validation.cjs','static/dev/s5-review.mjs','static/dev/s5-review.html'];
  function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=dir+'/'+e.name;if(e.isDirectory())walk(f);else files.push(f);}}
  for(const dir of ['static/core','static/modules','static/content','static/audio','static/illustrations'])walk(dir);
  return hash(files.sort().map(f=>f+':'+hash(fs.readFileSync(f))).join('\n'));
}
function inspectEvidence(e,version){
  const blockers=[];
  if(!e||e.fingerprint!==version) return ['缺少当前版本的实机验收记录'];
  if(!e.capturedAt||!Number.isFinite(Date.parse(e.capturedAt))||Date.parse(e.capturedAt)>Date.now()+300000||Date.now()-Date.parse(e.capturedAt)>7*86400000)blockers.push('实机记录时间无效或超过7天');
  if(!e.environment?.chromeStable||!e.environment?.zoom100||!e.environment?.mouse||!e.environment?.userAgent?.includes('Chrome/')||/Edg\/|OPR\//.test(e.environment.userAgent))blockers.push('目标Chrome与操作条件未确认');
  if(!(e.environment?.viewport?.width>=1280&&e.environment?.viewport?.height>=720))blockers.push('桌面验收视口不足1280×720');
  for(const item of matrix)if(e.results?.[item.id]?.status!=='passed'||!e.results[item.id].note?.trim())blockers.push('实机待验：'+item.label);
  return blockers;
}
function generate(evidence){
  const catalog=JSON.parse(fs.readFileSync('static/content/catalog.json','utf8')),version=fingerprint(),scenes=[];
  for(const [id,file]of Object.entries(catalog.scenes)){
    const pack=JSON.parse(fs.readFileSync('static/'+file,'utf8'));
    scenes.push({id,title:pack.title,status:pack.status,contentVersion:pack.contentVersion,released:catalog.releasedScenes.includes(id),missingAssets:pack.assets.filter(a=>!fs.existsSync(path.join('static',a.path))).map(a=>a.path)});
  }
  const blockers=inspectEvidence(evidence,version);
  blockers.push(...inspectScenes(catalog,scenes));
  const candidates=catalog.releasedScenes.length?catalog.releasedScenes:[catalog.previewScene].filter(Boolean);
  for(const id of candidates){
    if(!catalog.scenes[id])continue;
    const pack=JSON.parse(fs.readFileSync('static/'+catalog.scenes[id],'utf8'));
    const invalid=require('./audio-validation.cjs').inspectPack(pack,'static').filter(a=>!a.valid);
    if(invalid.length)blockers.push(id+' 无效本地音频：'+invalid.map(a=>a.id).join(', '));
    const validation=require('./static/core/model.js').validate(pack,{strict:true,exists:file=>fs.existsSync(path.join('static',file))});
    if(validation.errors.length)blockers.push(id+' 内容发布审校未通过（'+validation.errors.length+' 项）：'+validation.errors[0]);
  }
  let python;try{python=JSON.parse(fs.readFileSync('reports/s3-python-tests.json','utf8'));}catch{}
  const pythonFiles=['app.py','storage_v3.py','verify-s3.py','verify_migration.py',...fs.readdirSync('tests').filter(f=>/^test_.*\.py$/.test(f)).map(f=>'tests/'+f)];
  if(python?.status!=='passed'||python.skipped!==0||!pythonFiles.every(f=>python.sourceHashes?.[f]===hash(fs.readFileSync(f))))blockers.push('当前后端隔离测试未通过或源码已变化');
  let checks;try{checks=JSON.parse(fs.readFileSync('reports/checks-latest.json','utf8'));}catch{}
  if(checks?.status!=='passed'||!Object.entries(checks.sourceHashes||{}).length||!Object.entries(checks.sourceHashes||{}).every(([f,h])=>fs.existsSync(f)&&hash(fs.readFileSync(f))===h))blockers.push('当前统一自动检查未全部通过');
  if(catalog.mode==='development')blockers.push('当前是不限时开发模式，正式发布前需恢复发布模式并重新验收');
  return {stage:'S5',generatedAt:new Date().toISOString(),fingerprint:version,status:blockers.length?'blocked':'engineering-ready',blockers,scenes,matrix,familyTrial:'pending-voluntary-observation'};
}
if(require.main===module){
  process.chdir(__dirname);
  const evidence=process.argv[2]?JSON.parse(fs.readFileSync(process.argv[2],'utf8')):null,report=generate(evidence);
  fs.mkdirSync('reports',{recursive:true});fs.writeFileSync('reports/s5-release.json',JSON.stringify(report,null,2));fs.writeFileSync('static/dev/s5-manifest.json',JSON.stringify(report,null,2));
  console.log(report.status+'\n'+report.blockers.join('\n')+'\nReview: /dev/s5-review.html');if(report.status==='blocked')process.exitCode=1;
}
module.exports={matrix,inspectEvidence,generate};

