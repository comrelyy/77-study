// Run from any working directory: node D:\py_space\momoplanet\check.cjs
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const root = __dirname;
function run(command, args) {
  return spawnSync(command, args, {cwd:root, encoding:'utf8', timeout:60000,
    windowsHide:true, env:{...process.env, PYTHONDONTWRITEBYTECODE:'1'}});
}
const report = {timestamp:new Date().toISOString(), baseline:'PRD v1.8 + twelve-theme narrative and gameplay revision 2026-11-03',
  environment:{platform:process.platform, os:os.release(), node:process.version},
  sourceHashes:{}, checks:[], browserAcceptance:'not_run'};
const reviewSourcesGeneration=run(process.execPath,['review-sources.cjs']);
for (const file of ['app.py','static/theme.js','static/dialogue.js','check-theme.cjs','check-timing.cjs','tests/test_storage.py','static/dev/model.js','static/dev/prototype.js','static/dev/prototype.css','static/dev/index.html','static/dev/content/picnic.json','static/dev/content/tidy.json','check-prototype.cjs','validate-content.cjs','stage-gates.cjs','check-stage-gates.cjs','static/dev/baseline.js','static/dev/baseline.html','static/dev/browser-target.js']) {
  report.sourceHashes[file] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
}
for(const file of ['static/dev/player.js','check-audio-player.cjs','check-s1-audio.cjs','make-s1-audio.ps1'])report.sourceHashes[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
for(const file of ['static/dev/review-core.js','static/dev/review-page.js','static/dev/review.html','static/dev/review.css','static/dev/review-sources.json','review-sources.cjs','check-s1-review.cjs','docs/S1_FLOW_SPEC.md','docs/INTERACTION_CONTRACT.md'])report.sourceHashes[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const s2Files=['static/index.html','static/main.mjs','static/s2.css','static/core/model.js','static/core/player.js','static/core/app.mjs','static/core/dom.mjs','static/core/store.mjs','static/core/story-state.mjs','static/core/catalog.mjs','static/modules/story.mjs','static/modules/dialogue.mjs','static/modules/game.mjs','static/modules/summary.mjs','static/content/catalog.json','static/content/picnic.json','static/content/tidy.json','check-s2.mjs','tests/fake-dom.mjs','build-content.cjs','validate-s2-content.cjs'];
for(const file of s2Files)report.sourceHashes[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const s3Files=['storage_v3.py','verify-s3.py','verify_migration.py','tests/test_s3_storage.py','tests/test_s3_http.py','static/core/persistent-store.mjs','static/core/progress.mjs','check-s3.mjs'];
for(const file of s3Files)report.sourceHashes[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const s5Files=['release-scenes.cjs','s5-release.cjs','check-s5.cjs','static/dev/s5-review.html','static/dev/s5-review.mjs','tests/test_s4_parent.py'];
for(const file of s5Files)report.sourceHashes[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'static/content/catalog.json'),'utf8'));
const contentFiles=new Set(['lesson-build.cjs','route-build.cjs','route-bridges.cjs','check-route-build.mjs','check-lesson-build.mjs','check-lesson-state.mjs','check-lesson-flow.mjs','check-lesson-http.mjs','static/core/lesson-state.mjs','static/modules/lesson.mjs','launch-content.cjs','content-v2.cjs','extra-themes.cjs','draw-content-assets.cjs','content-audit.cjs','check-launch-content.mjs','check-narrative-games.mjs','check-story-playback.mjs','check-integrated-interaction.mjs','check-integrated-http.mjs','check-reload.mjs','check-reload-http.mjs','tests/browser-activity-harness.mjs','check-themes.mjs','static/modules/game-novel.mjs','static/core/interaction-flow.mjs','static/core/browser-activity.mjs',
  'static/dev/content-review.html','static/dev/content-review.css','static/dev/content-review.mjs',
  'static/core/theme-selection.mjs','static/core/route.mjs','check-route.mjs']);
for(const [id,file]of Object.entries(catalog.scenes)){
  contentFiles.add('static/'+file);
  const pack=JSON.parse(fs.readFileSync(path.join(root,'static',file),'utf8'));
  for(const asset of pack.assets)contentFiles.add('static/'+asset.path);
  contentFiles.add('static/audio/'+(id==='picnic'?'s4-manifest.json':'s4-'+id+'-manifest.json'));
}
for(const file of contentFiles)if(fs.existsSync(path.join(root,file)))report.sourceHashes[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
function record(name, result) {
  const passed = !result.error && result.status === 0;
  const item={name,status:passed?'passed':'failed',exitCode:result.status,
    output:(result.stdout||'')+(result.stderr||'')+(result.error?'\n'+result.error.message:'')};
  report.checks.push(item);
  console.log(`\n[${item.status.toUpperCase()}] ${name}\n${item.output.trim()}`);
}
record('review source fingerprints',reviewSourcesGeneration);
for (const file of ['static/theme.js','static/dialogue.js','static/dev/model.js','static/dev/prototype.js','static/dev/baseline.js','static/dev/browser-target.js','static/dev/player.js','static/dev/review-core.js','static/dev/review-page.js']) record('syntax: '+file,run(process.execPath,['--check',file]));
for (const file of ['check-theme.cjs','check-timing.cjs','validate-content.cjs','check-prototype.cjs','check-stage-gates.cjs','check-audio-player.cjs','check-s1-review.cjs']) record(file,run(process.execPath,[file]));
for(const file of s2Files.filter(x=>/\.(mjs|js|cjs)$/.test(x)))record('S2 syntax: '+file,run(process.execPath,['--check',file]));
for(const file of ['validate-s2-content.cjs','check-s2.mjs'])record(file,run(process.execPath,[file]));
for(const file of s3Files.filter(x=>x.endsWith('.mjs')))record('S3 syntax: '+file,run(process.execPath,['--check',file]));
record('check-s3.mjs',run(process.execPath,['check-s3.mjs']));
for(const file of ['static/core/enhancements.mjs','check-s6.mjs']){report.sourceHashes[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');record('S6 syntax: '+file,run(process.execPath,['--check',file]));}
record('check-s6.mjs',run(process.execPath,['check-s6.mjs']));
for(const file of ['static/core/review-sources.mjs','check-s7.mjs']){report.sourceHashes[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');record('S7 syntax: '+file,run(process.execPath,['--check',file]));}
record('check-s7.mjs',run(process.execPath,['check-s7.mjs']));
record('S5 syntax',run(process.execPath,['--check','static/dev/s5-review.mjs']));
record('check-s5.cjs',run(process.execPath,['check-s5.cjs']));
for(const file of ['audio-validation.cjs','check-audio-validation.cjs','check-s4-audio.cjs','make-s4-audio.ps1'])report.sourceHashes[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
for(const file of ['check-audio-validation.cjs','check-s4-audio.cjs'])record(file,run(process.execPath,[file]));
for(const file of ['content-audit.cjs','check-launch-content.mjs','check-narrative-games.mjs','check-story-playback.mjs','check-integrated-interaction.mjs','check-integrated-http.mjs','check-reload.mjs','check-reload-http.mjs','check-themes.mjs','check-route.mjs','check-route-build.mjs','check-lesson-build.mjs','check-lesson-state.mjs','check-lesson-flow.mjs','check-lesson-http.mjs'])record(file,run(process.execPath,[file]));
for(const file of ['static/dev/content-review.mjs','static/modules/game-novel.mjs','lesson-build.cjs','route-build.cjs','route-bridges.cjs','static/core/lesson-state.mjs','static/modules/lesson.mjs'])record('content syntax: '+file,run(process.execPath,['--check',file]));
const candidates = process.env.MOMO_PYTHON
  ? [[process.env.MOMO_PYTHON,[]]]
  : [[path.join(root,'.venv','Scripts','python.exe'),[]],
     [path.join(root,'.venv','bin','python'),[]],['python',[]],['py',['-3']]];
let python;
for (const [command,prefix] of candidates) {
  const probe=run(command,[...prefix,'-c','import sys; print(sys.version.split()[0]); raise SystemExit(sys.version_info < (3, 10))']);
  if (!probe.error && probe.status===0) {python={command,prefix};report.environment.python=probe.stdout.trim();break;}
}
if (python) {
  // Explicit absolute discovery directory prevents importing site-packages/tests.
  record('storage: project tests only',run(python.command,[...python.prefix,path.join(root,'verify-s3.py')]));
} else {
  let s3=null;try{s3=JSON.parse(fs.readFileSync(path.join(root,'reports/s3-python-tests.json'),'utf8'));}catch{}
  const requiredPython=['app.py','storage_v3.py','verify-s3.py','verify_migration.py',...fs.readdirSync(path.join(root,'tests')).filter(f=>/^test_.*\.py$/.test(f)).map(f=>'tests/'+f)];
  const s3Matches=s3?.stage==='S3'&&s3.status==='passed'&&s3.testsRun>=29&&s3.skipped===0&&requiredPython.every(file=>s3.sourceHashes?.[file]===crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'));
  if(s3Matches){
    report.checks.push({name:'storage: project tests only',status:'passed',execution:'reused local verify-s3.py report; not executed by this tool process',evidence:'reports/s3-python-tests.json',testsRun:s3.testsRun,output:s3.output});
    console.log('\n[PASSED — LOCAL REPORT] S3 Python: 29 isolated tests; all source hashes match.');
  }else{
    report.checks.push({name:'storage: project tests only',status:'blocked',
      reason:'No accessible Python 3.10+ and no matching user-local test evidence. Run locally or set MOMO_PYTHON.'});
    console.log('\n[BLOCKED] Python unavailable; S3 needs a current local verify-s3.py report. Old S0/S2 backend evidence cannot validate changed backend code.');
  }
}
report.status=report.checks.every(c=>c.status==='passed')?'passed':'incomplete';
const output=path.join(root,'reports','checks-latest.json');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log('\nReport: '+output+'\nLegacy regression checks do not establish PRD v1.8 acceptance.');
process.exitCode=report.status==='passed'?0:1;


