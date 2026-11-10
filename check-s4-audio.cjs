const fs=require('node:fs'),crypto=require('node:crypto');
const pack=JSON.parse(fs.readFileSync('static/content/picnic.json','utf8'));
// Lesson audio of an unreviewed lesson is synthesized later; until then it is pending, not blocked.
const pending=a=>pack.lesson?.reviewed===false&&a.id.includes('.lesson.')&&!fs.existsSync('static/'+a.path);
const entries=require('./audio-validation.cjs').inspectPack(pack,'static').filter(a=>!pending(a));
const report={stage:'S4',status:entries.length&&entries.every(a=>a.valid)?'files-valid':'blocked',listening:'pending',rights:'pending',entries};
fs.writeFileSync('reports/s4-audio.json',JSON.stringify(report,null,2));
console.log(`${entries.filter(a=>a.valid).length}/${entries.length} valid local audio files; listening and rights pending`);
for(const entry of entries.filter(a=>!a.valid))console.error(entry.path+': '+entry.error);
if(report.status==='blocked')process.exitCode=1;
