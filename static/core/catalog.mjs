export function chooseScene(catalog,requested,scene=null){
  if(catalog.schemaVersion!==1||!['development','release'].includes(catalog.mode)||!Array.isArray(catalog.releasedScenes)||!Array.isArray(catalog.developmentScenes)||!catalog.scenes)throw Error('Invalid catalog');
  if(requested){if(catalog.mode!=='development'||!catalog.developmentScenes.includes(requested)||!catalog.scenes[requested])throw Error('Draft scene is not published');return {id:requested,internal:true};}
  if(scene){if(!availableScenes(catalog).includes(scene))throw Error('Scene is not available');return {id:scene,internal:false};}
  const id=catalog.mode==='release'?catalog.releasedScenes[0]:catalog.previewScene;if(!id||!catalog.scenes[id])throw Error('No validated scene is available');return {id,internal:false};
}
export function availableScenes(catalog){
  const days=catalog.days||[],held=new Set(days.filter(d=>d.approved!==true).flatMap(d=>d.route.map(r=>r.id)));
  const ids=catalog.mode==='development'?[...(catalog.previewScenes||[]),catalog.previewScene,...catalog.releasedScenes,...days.filter(d=>d.approved===true).flatMap(d=>d.route.map(r=>r.id))]:catalog.releasedScenes;
  return [...new Set(ids.filter(Boolean))].filter(id=>!held.has(id)&&Object.hasOwn(catalog.scenes,id));
}
