const fs=require('node:fs'),path=require('node:path');
const {validate}=require('./static/core/model.js');
const {seasons,createPack,enhanceExisting}=require('./launch-content.cjs');
const extras=require('./extra-themes.cjs').addExtraThemes();
const {applyNarrative,applyGames}=require('./content-v2.cjs');
const {finalizeLesson,stripLesson}=require('./lesson-build.cjs'),{lessonLink}=require('./route-build.cjs');
const packs=[];
// Archive every current package before regeneration, including the six new themes.
const existingCatalog=require('./static/content/catalog.json');
for(const file of Object.values(existingCatalog.scenes)){
  const current=path.join(__dirname,'static',file);
  if(!fs.existsSync(current))continue;
  const previous=JSON.parse(fs.readFileSync(current,'utf8'));
  const archive=path.join(__dirname,'static/content/archive',previous.sceneId+'.'+previous.contentVersion+'.json');
  fs.mkdirSync(path.dirname(archive),{recursive:true});
  if(!fs.existsSync(archive))fs.copyFileSync(current,archive);
}
for(const id of ['picnic','tidy']){
  const source=JSON.parse(fs.readFileSync(path.join(__dirname,'static/dev/content',id+'.json'),'utf8'));
  const archive=path.join(__dirname,'static/content/archive',id+'.'+source.contentVersion+'.json');
  fs.mkdirSync(path.dirname(archive),{recursive:true});if(!fs.existsSync(archive))fs.writeFileSync(archive,JSON.stringify(source,null,2)+'\n');
  const current=path.join(__dirname,'static/content',id+'.json');
  if(fs.existsSync(current)){const previous=JSON.parse(fs.readFileSync(current,'utf8'));const old=path.join(__dirname,'static/content/archive',id+'.'+previous.contentVersion+'.json');if(!fs.existsSync(old))fs.writeFileSync(old,JSON.stringify(previous,null,2)+'\n');}
  packs.push(enhanceExisting(require('./tidy-content.cjs').completeTidy(require('./dialogue-content.cjs').applyDialogue(source))));
}
packs.push(...[...seasons,...extras].map(createPack));
const previousPacks=new Map();
for(const pack of packs){
  applyNarrative(pack);applyGames(pack);
  // Reuse only unchanged spoken content. Changed lines get new versioned paths;
  // an old audio file must never silently stand in for a new transcript.
  const current=path.join(__dirname,'static/content',pack.sceneId+'.json');
  let previous=null;
  if(fs.existsSync(current)){
    previous=JSON.parse(fs.readFileSync(current,'utf8'));
    for(const asset of pack.assets.filter(a=>a.kind==='audio')){
      const old=previous.assets.find(a=>a.id===asset.id&&a.kind==='audio'&&a.text===asset.text&&a.role===asset.role&&a.language===asset.language);
      if(old)asset.path=old.path;
    }
  }
  previousPacks.set(pack,previous);
}
// Second pass: review cards copy paths from the other packs, so every pack's audio paths must be settled first.
const routeCatalog=JSON.parse(fs.readFileSync(path.join(__dirname,'static/content/catalog.json'),'utf8'));
const stripped=Object.fromEntries(packs.map(p=>[p.sceneId,stripLesson(p)]));
for(const [i,pack] of packs.entries()){
  const previous=previousPacks.get(pack);
  const overlayPath=path.join(__dirname,'content-lesson',pack.sceneId+'.json');
  const overlay=fs.existsSync(overlayPath)?JSON.parse(fs.readFileSync(overlayPath,'utf8')):null;
  const finalized=finalizeLesson(stripLesson(pack),overlay,previous,lessonLink(routeCatalog,stripped,pack.sceneId));
  packs[i]=finalized.pack;
  for(const w of finalized.warnings)console.warn('lesson '+pack.sceneId+': '+w);
}
for(const pack of packs)fs.writeFileSync(path.join(__dirname,'static/content',pack.sceneId+'.json'),JSON.stringify(pack,null,2)+'\n');
const catalogPath=path.join(__dirname,'static/content/catalog.json');
const catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8'));
// Preview expansion never approves release or changes the chosen runtime mode.
const order=['dressing','washing','breakfast','cooking','tidy','picnic','park','transport','shopping','weather','gardening','bedtime'];
// Keep agent-generated themes (e.g. birthday) that this script does not own.
catalog.previewScenes=[...order,...catalog.previewScenes.filter(id=>!order.includes(id))];
catalog.requiredReleaseScenes=order;
for(const id of order)catalog.scenes[id]='content/'+id+'.json';
fs.writeFileSync(catalogPath,JSON.stringify(catalog,null,2)+'\n');
require('./draw-content-assets.cjs');
for(const pack of packs){
  const result=validate(pack,{exists:p=>fs.existsSync(path.join(__dirname,'static',p))});
  if(result.errors.length)throw Error(pack.sceneId+': '+result.errors.join('\n'));
}
console.log('Twelve narrative themes generated. Local audio and manual review required; release approval unchanged.');
