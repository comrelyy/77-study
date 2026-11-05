const fs=require('node:fs'),crypto=require('node:crypto');
const pack=JSON.parse(fs.readFileSync('static/content/picnic.json','utf8'));
const entries=require('./audio-validation.cjs').inspectPack(pack,'static');
const report={stage:'S4',status:entries.length&&entries.every(a=>a.valid)?'files-valid':'blocked',listening:'pending',rights:'pending',entries};
fs.writeFileSync('reports/s4-audio.json',JSON.stringify(report,null,2));
console.log(`${entries.filter(a=>a.valid).length}/${entries.length} valid local audio files; listening and rights pending`);
for(const entry of entries.filter(a=>!a.valid))console.error(entry.path+': '+entry.error);
if(report.status==='blocked')process.exitCode=1;
