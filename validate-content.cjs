const fs=require('node:fs'),path=require('node:path');
const {validate}=require('./static/dev/model.js');
const strict=process.argv.includes('--release');let failed=false;
for(const name of ['picnic','tidy']){
  const pack=JSON.parse(fs.readFileSync(path.join(__dirname,'static/dev/content',name+'.json'),'utf8'));
  const result=validate(pack,{strict,exists:p=>fs.existsSync(path.join(__dirname,'static',p))});
  console.log(`${name}: ${result.errors.length} errors, ${result.warnings.length} pending audio findings`);
  for(const e of result.errors)console.error('  '+e);
  failed ||= result.errors.length>0;
}
process.exitCode=failed?1:0;
