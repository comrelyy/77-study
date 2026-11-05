const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=__dirname;
const {detect}=require('./static/dev/browser-target.js');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
function read(file){try{return JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));}catch{return null;}}
function inspectS0(checks,environment){
  const blockers=[];
  if(!checks||checks.status!=='passed')blockers.push('自动检查未全部通过；Python访问阻断不能记作通过');
  const requiredFiles=['app.py','static/theme.js','static/dialogue.js','check-theme.cjs','check-timing.cjs','tests/test_storage.py'];
  const requiredChecks=['check-theme.cjs','check-timing.cjs','storage: project tests only'];
  for(const name of requiredChecks)if(!checks?.checks?.some(x=>x.name===name&&x.status==='passed'))blockers.push('缺少通过的检查：'+name);
  for(const file of requiredFiles)if(!checks?.sourceHashes?.[file])blockers.push('缺少源码检查快照：'+file);
  if(checks){for(const [file,expected]of Object.entries(checks.sourceHashes||{})){try{if(hash(file)!==expected)blockers.push('检查后源文件已变化：'+file);}catch{blockers.push('检查源文件缺失：'+file);}}}
  const required=['windows','chrome','zoom100Confirmed','stableChannelConfirmed','mouseConfirmed','viewport','service'];
  if(!environment||environment.stage!=='S0'||environment.schemaVersion!==1)blockers.push('缺少目标浏览器环境实测记录');
  else{
    for(const key of required)if(environment.checks?.[key]!==true)blockers.push('环境项未通过：'+key);
    const e=environment.environment;
    const target=detect(e?.userAgent);
    if(!e||e.browser!=='Chrome'||!target.windows||!target.chrome||e.browserVersion!==target.version)blockers.push('目标Windows/Chrome信息不完整或不匹配');
    if(!e?.viewport||e.viewport.width<1280||e.viewport.height<720)blockers.push('内容视口小于1280×720');
    const time=Date.parse(environment.capturedAt);if(!Number.isFinite(time)||time>Date.now()+300000||Date.now()-time>7*86400000)blockers.push('环境记录时间无效或超过7天，需重新采集');
  }
  return {stage:'S0',status:blockers.length?'blocked':'passed',blockers};
}
function inspectS1(checks,environment,audio,review,userConfirmation){
  const blockers=inspectS0(checks,environment).blockers.map(x=>'S0: '+x);
  if(audio?.status!=='passed'||audio.results?.length!==10)blockers.push('S1端到端10项本地样音技术检查未通过');
  const sampleHashes=Object.fromEntries((audio?.results||[]).filter(x=>x.id&&x.sha256).map(x=>[x.id,x.sha256]));
  const sourceHashes=require('./review-sources.cjs').sourceHashes();
  const confirmed=userConfirmation?.stage==='S1'&&userConfirmation.schemaVersion===1&&userConfirmation.status==='user_confirmed'&&
    userConfirmation.contentVersion==='0.1.0'&&typeof userConfirmation.exactUserMessage==='string'&&userConfirmation.exactUserMessage.trim()&&
    Object.entries(sourceHashes).every(([file,hash])=>userConfirmation.sourceHashes?.[file]===hash)&&
    Object.keys(sampleHashes).length===10&&Object.entries(sampleHashes).every(([id,hash])=>userConfirmation.sampleHashes?.[id]===hash);
  if(!confirmed)blockers.push(...require('./static/dev/review-core.js').validate(review,{sourceHashes,sampleHashes}));
  return {stage:'S1',status:blockers.length?'blocked':'passed',blockers};
}
function inspectS2(checks,s1,ui){
  const blockers=[];
  if(s1?.status!=='passed')blockers.push('S1阶段尚未通过');
  if(checks?.status!=='passed')blockers.push('S2自动检查未全部通过');
  for(const name of ['validate-s2-content.cjs','check-s2.mjs'])if(!checks?.checks?.some(x=>x.name===name&&x.status==='passed'))blockers.push('缺少S2检查：'+name);
  const sources=Object.entries(checks?.sourceHashes||{}).filter(([file])=>/^static\/(core|modules|content)\//.test(file)||['static/index.html','static/main.mjs','static/s2.css'].includes(file));
  if(!sources.length)blockers.push('缺少S2源码检查快照');
  for(const [file,expected]of sources){try{if(hash(file)!==expected)blockers.push('S2检查后源码已变化：'+file);}catch{blockers.push('S2源文件缺失：'+file);}}
  if(ui?.stage!=='S2'||ui.status!=='user_confirmed'||!ui.exactUserMessage||!sources.every(([file,expected])=>ui.sourceHashes?.[file]===expected))blockers.push('待目标Chrome实际布局、键盘、声音及退出核验');
  return {stage:'S2',status:blockers.length?'blocked':'passed',blockers};
}
function inspectS3(checks,s2,python,ui){
  const blockers=[];
  if(s2?.status!=='passed')blockers.push('S2阶段尚未通过');
  if(checks?.status!=='passed'||!checks?.checks?.some(x=>x.name==='check-s3.mjs'&&x.status==='passed'))blockers.push('S3自动检查尚未全部通过');
  const files=['app.py','storage_v3.py','verify-s3.py','verify_migration.py','tests/test_storage.py','tests/test_s3_storage.py','tests/test_s3_http.py'];
  if(python?.status!=='passed'||python.testsRun!==29||python.skipped!==0||!files.every(file=>{try{return python.sourceHashes?.[file]===hash(file);}catch{return false;}}))blockers.push('待本机运行29项隔离Python/HTTP/迁移测试，旧后端通过记录不能复用');
  const uiSources=Object.entries(checks?.sourceHashes||{}).filter(([file])=>/^static\/(core|modules|content)\//.test(file)||['app.py','storage_v3.py','static/main.mjs','static/index.html'].includes(file));
  if(ui?.stage!=='S3'||ui.status!=='user_confirmed'||!ui.exactUserMessage||!uiSources.length||!uiSources.every(([file,digest])=>ui.sourceHashes?.[file]===digest))blockers.push('待服务重启后的刷新恢复、多页、到点及故障实机核验');
  return {stage:'S3',status:blockers.length?'blocked':'passed',blockers};
}
if(require.main===module){
  const reviewArgument=process.argv.indexOf('--review');
  if(reviewArgument>=0){
    try{const review=JSON.parse(fs.readFileSync(process.argv[reviewArgument+1],'utf8'));if(review.stage!=='S1'||review.schemaVersion!==1||!Array.isArray(review.listenedIds))throw Error('invalid review schema');fs.mkdirSync(path.join(root,'reports'),{recursive:true});fs.writeFileSync(path.join(root,'reports/s1-review.json'),JSON.stringify(review,null,2)+'\n');}catch(error){console.error('无法导入S1审阅记录：'+error.message);process.exit(1);}
  }
  const argument=process.argv.indexOf('--environment');
  if(argument>=0){
    try{
      if(!process.argv[argument+1])throw Error('missing path');
      const environment=JSON.parse(fs.readFileSync(process.argv[argument+1],'utf8'));
      const probe=inspectS0(read('reports/checks-latest.json'),environment);
      const invalid=probe.blockers.filter(x=>!x.startsWith('自动检查')&&!x.startsWith('缺少通过')&&!x.startsWith('缺少源码')&&!x.startsWith('检查后')&&!x.startsWith('检查源文件'));
      if(invalid.length)throw Error(invalid.join('；'));
      fs.mkdirSync(path.join(root,'reports'),{recursive:true});fs.writeFileSync(path.join(root,'reports','s0-environment.json'),JSON.stringify(environment,null,2)+'\n');
    }catch(error){console.error('无法导入环境记录：'+error.message);process.exit(1);}
  }
  const stageIndex=process.argv.indexOf('--stage'),stage=stageIndex<0?'S0':process.argv[stageIndex+1];
  if(!['S0','S1','S2','S3'].includes(stage)){console.error('Supported stages: S0, S1, S2, S3');process.exit(1);}
  const checks=read('reports/checks-latest.json');
  const s1=()=>inspectS1(checks,read('reports/s0-environment.json'),require('./check-s1-audio.cjs').check(),read('reports/s1-review.json'),read('reports/s1-user-confirmed.json'));
  const result=stage==='S0'?inspectS0(checks,read('reports/s0-environment.json')):stage==='S1'?s1():stage==='S2'?inspectS2(checks,s1(),read('reports/s2-ui-confirmed.json')):inspectS3(checks,read('reports/stage-s2.json'),read('reports/s3-python-tests.json'),read('reports/s3-ui-confirmed.json'));
  const report={...result,checkedAt:new Date().toISOString(),nextStage:result.status==='passed'?({S0:'S1',S1:'S2',S2:'S3',S3:'S4'}[stage]):null};
  if(stage==='S1'&&read('reports/s1-user-confirmed.json'))report.userCompletionEvidence='reports/s1-user-confirmed.json; user attestation, not assistant listening';
  fs.mkdirSync(path.join(root,'reports'),{recursive:true});fs.writeFileSync(path.join(root,'reports','stage-gates-latest.json'),JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(path.join(root,'reports','stage-'+stage.toLowerCase()+'.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));process.exitCode=result.status==='passed'?0:1;
}
module.exports={inspectS0,inspectS1,inspectS2,inspectS3};
