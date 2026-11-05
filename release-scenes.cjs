function inspectScenes(catalog,scenes){
  const blockers=[];
  const ids=Array.isArray(catalog.releasedScenes)?catalog.releasedScenes:[];
  if(!ids.length)blockers.push('正式发布清单为空');
  if(new Set(ids).size!==ids.length)blockers.push('正式发布清单包含重复情景');
  for(const id of catalog.requiredReleaseScenes||[])if(!ids.includes(id))blockers.push('首发主题尚未就绪：'+id);
  const candidates=ids.length?ids:(catalog.mode==='development'&&catalog.previewScene?[catalog.previewScene]:[]);
  for(const id of new Set(candidates)){
    const scene=scenes.find(s=>s.id===id);
    if(!scene){blockers.push('发布情景不存在：'+id);continue;}
    if(scene.status!=='released')blockers.push('情景尚未正式批准发布：'+id);
    if(scene.missingAssets.length)blockers.push(id+' 缺少 '+scene.missingAssets.length+' 项本地资源');
  }
  return blockers;
}
module.exports={inspectScenes};

