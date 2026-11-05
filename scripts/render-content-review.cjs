// Optional offline vector rendering for artwork QA, not a browser acceptance test.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const {Resvg}=require(path.join(root,'.tools/svg-review/node_modules/@resvg/resvg-js'));
const catalog=require('../static/content/catalog.json');
const output=path.join(root,'reports/content-art');fs.mkdirSync(output,{recursive:true});
const selected=new Set(process.argv.slice(2));
for(const id of catalog.previewScenes){
  const pack=require(path.join(root,'static',catalog.scenes[id]));
  const pictures=[...pack.modules.story];if(pack.modules.game.illustration)pictures.push({id:id+'.game',illustration:pack.modules.game.illustration});
  for(const scene of pictures){
    if(selected.size&&!selected.has(scene.id))continue;
    const asset=pack.assets.find(a=>a.id===scene.illustration);
    const renderer=new Resvg(fs.readFileSync(path.join(root,'static',asset.path)),{fitTo:{mode:'width',value:600}});
    fs.writeFileSync(path.join(output,scene.id+'.png'),renderer.render().asPng());
  }
}
console.log('Current story artworks rasterized offline; no browser used.');
