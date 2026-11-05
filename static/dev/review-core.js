(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.MomoReview=api;})(globalThis,()=>{
  const fields=['flowsReviewed','contractsReviewed','prototypeVisualReviewed','sampleListeningReviewed','sourceRightsReviewed'];
  function requiredIds(pack){const s=pack.modules.story[0],d=pack.modules.dialogue[0];return [...new Set([...s.segments.map(x=>x.audio),...d.question.map(x=>x.audio),...d.options.flatMap(x=>[x.audio,...x.followUp.map(x=>x.audio)]),pack.words[0].audio])];}
  function validate(review,{sourceHashes,sampleHashes,now=Date.now()}={}){
    const errors=[];
    if(!review||review.stage!=='S1'||review.schemaVersion!==1)return ['缺少S1审阅记录'];
    if(typeof review.reviewer!=='string'||!review.reviewer.trim())errors.push('缺少审阅者');
    const time=Date.parse(review.reviewedAt);if(!Number.isFinite(time)||time>now+300000||now-time>7*86400000)errors.push('审阅时间无效或超过7天');
    if(review.contentVersion!=='0.1.0')errors.push('内容版本不匹配');
    for(const key of fields)if(review.checks?.[key]!==true)errors.push('未完成审阅：'+key);
    if(typeof review.sourceRightsEvidence!=='string'||!review.sourceRightsEvidence.trim())errors.push('缺少声音来源和使用权限的依据');
    if(!sourceHashes||!Object.keys(sourceHashes).length)errors.push('缺少当前源文件指纹');
    for(const [file,hash]of Object.entries(sourceHashes||{}))if(review.sourceHashes?.[file]!==hash)errors.push('审阅后源文件变化或缺失：'+file);
    const ids=Object.keys(sampleHashes||{});
    if(ids.length!==10)errors.push('需要10项实际样音指纹');
    for(const id of ids){if(review.sampleHashes?.[id]!==sampleHashes[id])errors.push('样音变化或未核对：'+id);if(!Array.isArray(review.listenedIds)||!review.listenedIds.includes(id))errors.push('尚未完整试听：'+id);}
    return errors;
  }
  return {fields,requiredIds,validate};
});
