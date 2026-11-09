(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.MomoPrototype=api;})(globalThis,()=>{
  'use strict';
  const idOK=x=>typeof x==='string'&&/^[a-z][a-z0-9._-]*$/.test(x);
  const list=x=>Array.isArray(x)?x:[];
  const words=x=>String(x||'').trim().split(/\s+/).filter(Boolean).length;
  function validate(pack,{exists=()=>true,strict=false}={}){
    const errors=[],warnings=[],ids=new Set();
    const error=(where,text)=>errors.push(where+': '+text);
    function identity(id,where){if(!idOK(id))error(where,'invalid ID');else if(ids.has(id))error(where,'duplicate ID '+id);else ids.add(id);}
    if(!pack||typeof pack!=='object')return {errors:['package: expected object'],warnings};
    for(const key of ['assets','words'])if(!Array.isArray(pack[key])||pack[key].some(x=>!x||typeof x!=='object'||Array.isArray(x)))error(key,'expected object array');
    const modules=pack.modules;
    if(!modules||typeof modules!=='object')error('modules','expected object');
    else{
      for(const key of ['story','dialogue'])if(!Array.isArray(modules[key])||modules[key].some(x=>!x||typeof x!=='object'))error(key,'expected object array');
      if(!modules.game||typeof modules.game!=='object')error('game','expected object');
    }
    if(errors.length)return {errors,warnings};
    for(const s of modules.story)if(!Array.isArray(s.segments)||s.segments.some(x=>!x||typeof x!=='object')||!Array.isArray(s.hotspots)||s.hotspots.some(x=>!x||typeof x!=='object'))error('story','invalid segment/hotspot structure');
    for(const d of modules.dialogue){if(!Array.isArray(d.question)||d.question.some(x=>!x||typeof x!=='object')||!Array.isArray(d.options)||d.options.some(x=>!x||typeof x!=='object'||!Array.isArray(x.followUp)||x.followUp.some(s=>!s||typeof s!=='object')))error('dialogue','invalid question/reply structure');}
    if(!Array.isArray(modules.game.questions)||modules.game.questions.some(x=>!x||typeof x!=='object'))error('game','invalid questions');
    if(modules.game.zones!==undefined&&(!Array.isArray(modules.game.zones)||modules.game.zones.some(x=>!x||typeof x!=='object')))error('game','invalid zones');
    if(errors.length)return {errors,warnings};
    if(pack.schemaVersion!==1)error('schemaVersion','expected 1');
    identity(pack.sceneId,'sceneId');identity(pack.stickerId,'stickerId');
    if(typeof pack.title!=='string'||!pack.title.trim())error('title','required');
    if(typeof pack.contentVersion!=='string'||!/^\d+\.\d+\.\d+$/.test(pack.contentVersion))error('contentVersion','expected semantic version');
    if(!['draft','released'].includes(pack.status))error('status','unknown');
    if(strict&&pack.status!=='released')error('status','draft cannot be released');
    if(!Array.isArray(pack.compatibleFrom)||pack.compatibleFrom.some(x=>typeof x!=='string'))error('compatibleFrom','expected version list');
    const assets=new Map(),vocab=new Map();
    for(const a of list(pack.assets)){
      identity(a.id,'asset');assets.set(a.id,a);
      if(!['image','audio'].includes(a.kind))error(a.id,'unknown asset kind');
      if(typeof a.path!=='string'||!/^[a-zA-Z0-9_./-]+$/.test(a.path)||a.path.startsWith('/')||a.path.split('/').some(x=>['..','.',''].includes(x)))error(a.id,'unsafe resource path');
      else if(!exists(a.path)){const message=a.id+': missing resource '+a.path;(strict||a.kind!=='audio'?errors:warnings).push(message);}
      if(a.kind==='audio'){
        if(typeof a.text!=='string'||!a.text.trim()||!a.language||!a.role)error(a.id,'missing audio text/language/role');
        if(!a.source||!a.rights||a.reviewed!==true)(strict?errors:warnings).push(a.id+': audio source/rights/review pending');
      }
    }
    function asset(id,kind,where){if(!assets.has(id)||assets.get(id).kind!==kind)error(where,'invalid '+kind+' reference '+id);}
    function word(id,where){if(!vocab.has(id))error(where,'invalid word reference '+id);}
    for(const w of list(pack.words)){identity(w.id,'word');vocab.set(w.id,w);if(typeof w.text!=='string'||!w.text.trim()||typeof w.cn!=='string'||!w.cn.trim())error(w.id,'missing word text');asset(w.image,'image',w.id);asset(w.audio,'audio',w.id);if(assets.get(w.audio)?.text!==w.text)error(w.id,'word/audio text mismatch');}
    if(!vocab.size)error('words','empty');
    function segments(items,where){if(!Array.isArray(items)||!items.length)error(where,'empty segments');for(const s of list(items)){identity(s.id,where);if(typeof s.text!=='string'||!s.text.trim()||words(s.text)>15)error(s.id,'segment must have 1–15 words');asset(s.audio,'audio',s.id);if(assets.get(s.audio)?.text!==s.text)error(s.id,'audio text mismatch');if('cn' in s&&(typeof s.cn!=='string'||!s.cn.trim()))error(s.id,'segment cn must be non-empty');}}
    const m=pack.modules||{};
    for(const key of ['story','dialogue','game','summary'])if(!m[key])error('modules','missing '+key);
    if(!list(m.story).length)error('story','empty');
    for(const s of list(m.story)){
      identity(s.id,'story');if(!['picnic-meadow','tidy-room','daily-life'].includes(s.templateId))error(s.id,'unknown template');
      if(s.illustration!==undefined)asset(s.illustration,'image',s.id);
      if(s.templateId==='daily-life'&&!s.illustration)error(s.id,'daily-life scene needs illustration');
      if(!Array.isArray(s.characters)||s.characters.length<1||s.characters.length>2)error(s.id,'expected 1–2 characters');
      for(const c of list(s.characters))asset(c,'image',s.id);
      word(s.mainWord,s.id);segments(s.segments,s.id);
      if(!Array.isArray(s.hotspots)||s.hotspots.length>2)error(s.id,'at most 2 hotspots');
      for(const h of list(s.hotspots)){word(h.word,s.id);if(!Number.isFinite(h.x)||!Number.isFinite(h.y)||h.x<0||h.x>1||h.y<0||h.y>1)error(s.id,'hotspot outside normalized scene');}
    }
    if(!list(m.dialogue).length)error('dialogue','empty');
    for(const d of list(m.dialogue)){
      identity(d.id,'dialogue');segments(d.question,d.id);
      if(!Array.isArray(d.options)||d.options.length<2||d.options.length>3)error(d.id,'expected 2–3 replies');
      for(const o of list(d.options)){identity(o.id,'reply');asset(o.image,'image',o.id);asset(o.audio,'audio',o.id);if(typeof o.text!=='string'||!o.text.trim()||words(o.text)>8)error(o.id,'reply must have 1–8 words');if(assets.get(o.audio)?.text!==o.text)error(o.id,'audio text mismatch');segments(o.followUp,o.id);}
    }
    const g=m.game||{};
    if(g.collectionImage!==undefined&&(typeof g.collectionImage!=='string'||!/^illustrations\/[a-z0-9-]+\.svg$/.test(g.collectionImage)||!exists(g.collectionImage)))error('game','invalid collection image');
    if(!['listen-pack','select-place','scene-find','story-order'].includes(g.type))error('game','unknown gameplay');
    if(g.type==='scene-find'){
      asset(g.illustration,'image','game');
      if(!Array.isArray(g.hotspots)||g.hotspots.length<2)error('game','scene-find needs hotspots');
      const seen=new Set();for(const h of list(g.hotspots)){word(h.word,'game');if(seen.has(h.word))error('game','duplicate hotspot');seen.add(h.word);if(!Number.isFinite(h.x)||!Number.isFinite(h.y)||h.x<.05||h.x>.95||h.y<.05||h.y>.95)error('game','hotspot outside safe scene');}
      for(const q of list(g.questions))for(const w of list(q.options))if(!seen.has(w))error(q.id,'missing hotspot');
    }
    if(!list(g.questions).length)error('game','empty');
    for(const q of list(g.questions)){identity(q.id,'game');word(q.target,q.id);if(!Array.isArray(q.options)||q.options.length<2||q.options.length>4)error(q.id,'expected 2–4 candidates');for(const w of list(q.options))word(w,q.id);if(new Set(list(q.options)).size!==list(q.options).length)error(q.id,'duplicate candidates');if(!list(q.options).includes(q.target))error(q.id,'target absent');}
    if(g.type==='select-place'){const zones=new Set();for(const z of list(g.zones)){identity(z.id,'zone');zones.add(z.id);if(!z.label)error(z.id,'missing label');}for(const q of list(g.questions))if(!zones.has(q.zone))error(q.id,'unknown destination');}
    if(g.type==='story-order')for(const q of list(g.questions)){if(!Array.isArray(q.solution)||q.solution.length!==q.options.length||new Set(q.solution).size!==q.options.length||q.solution.some(w=>!q.options.includes(w)))error(q.id,'invalid sequence solution');if(!q.instructions||!q.labels||q.options.some(w=>typeof q.labels[w]!=='string'||!q.labels[w].trim()))error(q.id,'sequence needs action labels and instructions');if(q.labelAudio!==undefined)for(const w of q.options){asset(q.labelAudio[w],'audio',q.id);if(assets.get(q.labelAudio[w])?.text!==q.labels[w])error(q.id,'label audio text mismatch');}}
    if(!list(m.summary).length)error('summary','empty');for(const w of list(m.summary))word(w,'summary');
    if(new Set(list(m.summary)).size!==list(m.summary).length)error('summary','duplicate words');
    if(pack.interaction){const plan=pack.interaction.gameAfterDialogue;if(!Array.isArray(plan)||plan.length!==g.questions.length||plan.some((n,i)=>!Number.isInteger(n)||n<1||n>m.dialogue.length||i>0&&n<plan[i-1]))error('interaction','invalid dialogue/game schedule');}
    if(pack.lesson!==undefined){
      const l=pack.lesson,steps=l&&l.steps;
      if(!l||typeof l!=='object'||Array.isArray(l))error('lesson','expected object');
      else if(l.schemaVersion!==1)error('lesson','expected schemaVersion 1');
      else if(!Array.isArray(steps)||!steps.length||steps.some(x=>!x||typeof x!=='object'))error('lesson','expected non-empty steps');
      else{
        if(steps[0].kind!=='words')error('lesson','first step must be words');
        if(steps.at(-1).kind!=='end')error('lesson','last step must be end');
        for(const s of steps){
          const at=typeof s.id==='string'?s.id:'lesson';identity(s.id,at);
          if(!['words','story','quiz','fill','reply','game','match','end'].includes(s.kind)){error(at,'unknown step kind '+s.kind);continue;}
          if(s.kind==='words'||s.kind==='match'){if(!Array.isArray(s.words)||!s.words.length)error(at,'expected words');for(const w of list(s.words))word(w,at);}
          if(s.kind==='story'&&!list(m.story).some(x=>x.id===s.storyId))error(at,'invalid story reference '+s.storyId);
          if(s.kind==='quiz'||s.kind==='fill'){
            if(!Array.isArray(s.options)||!s.options.length)error(at,'expected options');
            for(const w of list(s.options))word(w,at);word(s.answer,at);
            if(new Set(list(s.options)).size!==list(s.options).length)error(at,'duplicate options');
            if(!list(s.options).includes(s.answer))error(at,'answer absent from options');
          }
          if(s.kind==='quiz'&&(typeof s.question!=='string'||!s.question.trim()))error(at,'missing question');
          if(s.kind==='fill'){
            const seg=list(m.story).flatMap(x=>list(x.segments)).find(x=>x.id===s.segmentId);
            if(!seg)error(at,'invalid segment reference '+s.segmentId);
            else if(vocab.has(s.answer)&&(String(s.before)+vocab.get(s.answer).text+String(s.after)).toLowerCase()!==seg.text.toLowerCase())error(at,'fill text does not match segment');
            asset(s.image,'image',at);
          }
          if(s.kind==='reply'){
            if(!Array.isArray(s.rounds)||!s.rounds.length)error(at,'expected rounds');
            for(const r of list(s.rounds)){
              const d=list(m.dialogue).find(x=>x.id===r.dialogueId),w=r.wrong||{};
              if(!d)error(at,'invalid dialogue reference '+r.dialogueId);
              else if(!d.options.some(o=>o.id===r.answer))error(at,'answer is not a reply of '+r.dialogueId);
              identity(w.id,at);
              if(typeof w.text!=='string'||!w.text.trim()||words(w.text)>8)error(at,'wrong reply must have 1–8 words');
              if(typeof w.cn!=='string'||!w.cn.trim())error(at,'wrong reply missing cn');
              asset(w.image,'image',at);asset(w.audio,'audio',at);
              if(assets.get(w.audio)?.text!==w.text)error(at,'wrong reply audio text mismatch');
            }
          }
        }
      }
    }
    return {errors,warnings};
  }
  // Deliberately memory-only. The production storage/allowance service arrives in S3.
  class Session{
    constructor(pack,{save=async()=>{},uuid=()=>globalThis.crypto.randomUUID(),random=Math.random}={}){this.pack=pack;this.save=save;this.uuid=uuid;this.random=random;this.generation=0;this.enter('dialogue');}
    enter(module){this.generation++;this.module=module;this.index=0;this.selection=null;this.sequence=[];this.finished=false;this.demo=false;this.demoUsed=false;this.helpTypes=[];this.orders=new Map();this.pending=null;this.busy=false;this.failed=false;this.heard=false;this.done=false;this.attempts=0;this.events=[];}
    candidates(){
      const q=this.pack.modules.game.questions[this.index];
      if(!this.orders.has(q.id)){const order=[...q.options];for(let i=order.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}this.orders.set(q.id,order);}
      return [...this.orders.get(q.id)];
    }
    help(kind){
      if(this.busy||this.failed||this.done||!['instructions','repeat','demo'].includes(kind))return false;
      if(!this.helpTypes.includes(kind))this.helpTypes.push(kind);
      if(kind==='demo'&&this.module==='game'){this.demoUsed=true;const q=this.pack.modules.game.questions[this.index];if(this.pack.modules.game.type==='story-order'){this.sequence=[...q.solution];this.selection=this.sequence.at(-1);}else this.selection=q.target;}
      return true;
    }
    select(id,{demo=false}={}){if(this.busy||this.failed||this.done)return false;const allowed=this.module==='dialogue'?this.pack.modules.dialogue[this.index].options.map(x=>x.id):this.pack.modules.game.questions[this.index].options;if(!allowed.includes(id))return false;if(this.module==='game'&&this.pack.modules.game.type==='story-order'){if(this.sequence.includes(id))return false;this.sequence.push(id);}this.selection=id;this.demo=demo;return true;}
    undoSequence(){if(this.busy||this.failed||this.done||this.module!=='game'||this.pack.modules.game.type!=='story-order'||!this.sequence.length)return false;this.sequence.pop();this.selection=this.sequence.at(-1)||null;return true;}
    async confirm(zone){
      if(this.busy||this.failed||this.done||!this.selection)return false;
      const p=this.pack,m=this.module,step=m==='dialogue'?p.modules.dialogue[this.index]:p.modules.game.questions[this.index];
      if(m==='game'&&['listen-pack','scene-find'].includes(p.modules.game.type)&&!this.heard)return false;
      if(m==='game'&&p.modules.game.type==='story-order'&&this.sequence.length!==step.solution.length)return false;
      if(m==='game'&&p.modules.game.type==='select-place'&&!p.modules.game.zones.some(x=>x.id===zone))return false;
      const selected=m==='dialogue'?step.options.find(x=>x.id===this.selection):p.words.find(x=>x.id===this.selection);
      this.pending={operationId:this.uuid(),sceneId:p.sceneId,contentVersion:p.contentVersion,moduleId:m,stepId:step.id,
        selectedId:this.selection,text:selected.text,source:this.demo?'demo':'child',
        ...(m==='game'?{attempt:this.attempts+1,zone:zone||null,hinted:this.demoUsed,helpTypes:[...this.helpTypes],candidateOrder:this.candidates(),...(p.modules.game.type==='story-order'?{sequenceOrder:[...this.sequence]}:{}),matched:p.modules.game.type==='story-order'?this.sequence.every((w,i)=>w===step.solution[i]):this.selection===step.target&&(p.modules.game.type!=='select-place'||zone===step.zone)}:{})};
      return this.submit();
    }
    async submit(){
      const event=this.pending,generation=this.generation;if(!event||this.busy)return false;this.busy=true;
      try{await this.save(event);if(generation!==this.generation)return false;this.events.push(event);this.pending=null;this.failed=false;if(this.module==='game')this.attempts++;this.done=this.module==='dialogue'||event.matched;return true;}
      catch{if(generation===this.generation)this.failed=true;return false;}
      finally{if(generation===this.generation)this.busy=false;}
    }
    retry(){return this.failed?this.submit():Promise.resolve(false);}
    next(){if(this.busy||this.failed)return false;const count=this.module==='dialogue'?this.pack.modules.dialogue.length:this.pack.modules.game.questions.length;if(this.index+1>=count)return false;this.index++;this.selection=null;this.sequence=[];this.demo=false;this.demoUsed=false;this.helpTypes=[];this.heard=false;this.done=false;this.attempts=0;return true;}
    exit(){this.generation++;this.busy=false;this.pending=null;this.failed=false;this.selection=null;this.done=true;}
  }
  return {validate,Session};
});
