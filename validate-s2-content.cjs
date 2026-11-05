const fs=require('node:fs'),path=require('node:path');
const {validate}=require('./static/core/model.js');
const catalog=require('./static/content/catalog.json');let failed=false;
if(catalog.schemaVersion!==1||!['development','release'].includes(catalog.mode))throw Error('Invalid catalog');
if(process.argv.includes('--release')&&catalog.releasedScenes.length===0){console.error('No complete scene has been approved for release.');failed=true;}
for(const [id,file]of Object.entries(catalog.scenes)){
  if(!/^content\/[a-z0-9-]+\.json$/.test(file))throw Error('Unsafe catalog path');
  const pack=JSON.parse(fs.readFileSync(path.join(__dirname,'static',file),'utf8'));
  const strict=catalog.releasedScenes.includes(id)||process.argv.includes('--release');
  const result=validate(pack,{strict,exists:p=>fs.existsSync(path.join(__dirname,'static',p))});
  if(id!==pack.sceneId)result.errors.push('catalog/scene ID mismatch');
  if(catalog.developmentScenes.includes(id)&&catalog.releasedScenes.includes(id))result.errors.push('draft scene cannot appear in release catalog');
  console.log(`${id}: ${result.errors.length} errors, ${result.warnings.length} pending resource/review findings`);
  for(const error of result.errors)console.error(error);failed ||= result.errors.length>0;
}
process.exitCode=failed?1:0;
