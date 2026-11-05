// S1 development packages; rebuilding never changes the production release list.
const fs=require('node:fs'),path=require('node:path');
function make(sceneId,title,items,storyCount,dialogueCount,type){
  const p={schemaVersion:1,sceneId,contentVersion:'0.1.0',status:'draft',compatibleFrom:[],title,
    stickerId:sceneId+'.sticker',assets:[],words:[],modules:{story:[],dialogue:[],game:{type,questions:[]},summary:[]}};
  function image(id,file){p.assets.push({id,kind:'image',path:'illustrations/'+file+'.svg'});return id;}
  function audio(id,text,role='momo'){p.assets.push({id,kind:'audio',path:'audio/'+sceneId+'/'+id+'.wav',text,language:'en-US',role,source:null,rights:null,reviewed:false});return id;}
  function segment(id,text){return {id,text,audio:audio(id+'.audio',text)};}
  const momo=image(sceneId+'.momo','momo'),bunny=image(sceneId+'.bunny','bunny');
  const wave=image(sceneId+'.wave','wave');
  for(const [text,cn,sense] of items){const id='en.'+text+'.'+sense;p.words.push({id,text,cn,image:image(sceneId+'.'+text+'.image',text==='teddy'?'momo':text),audio:audio(sceneId+'.'+text+'.audio',text)});p.modules.summary.push(id);}
  for(let i=0;i<storyCount;i++){
    const w=p.words[i%p.words.length],id=sceneId+'.story.'+(i+1);
    p.modules.story.push({id,title:(i+1)+'. '+w.cn,templateId:type==='listen-pack'?'picnic-meadow':'tidy-room',characters:[momo,bunny],mainWord:w.id,
      hotspots:[{word:w.id,x:.72,y:.65}],translation:type==='listen-pack'?'和 Momo 一起分享'+w.cn+'。':'把'+w.cn+'送回自己的家。',
      segments:[segment(id+'.intro',type==='listen-pack'?'Hello! Let us have a picnic.':'Let us put our toys away.'),segment(id+'.item','Look! '+w.text+'. Let us share!')]});
  }
  for(let i=0;i<dialogueCount;i++){
    const w=p.words[i%p.words.length],other=p.words[(i+1)%p.words.length],id=sceneId+'.dialogue.'+(i+1);
    const variants=type==='listen-pack'?
      [[w.image,'Yes, please!','好的，谢谢！','Here you are.'],[other.image,'A '+other.text+', please.','我想要'+other.cn+'，谢谢。','Of course. Here you are.'],[wave,'No, thank you.','不用了，谢谢。','That is okay. Let us sit together.']]:
      [[w.image,'Yes, let us tidy up!','好，我们一起整理吧！','Thank you for helping!'],[wave,'Please help me.','请帮帮我。','Of course. Let us do it together.']];
    p.modules.dialogue.push({id,question:[segment(id+'.question',type==='listen-pack'?'Would you like some '+w.text+'?':'Shall we put the '+w.text+' away?')],
      options:variants.map(([image,text,cn,follow],j)=>{const oid=id+'.reply.'+(j+1);return {id:oid,image,text,cn,audio:audio(oid+'.audio',text,'bunny'),followUp:[segment(oid+'.follow',follow)]};})});
  }
  if(type==='select-place')p.modules.game.zones=[{id:'tidy.box',label:'玩具箱'},{id:'tidy.shelf',label:'小架子'}];
  p.modules.game.questions=p.words.map((w,i)=>({id:sceneId+'.game.'+(i+1),target:w.id,options:p.words.map(w=>w.id),...(type==='select-place'?{zone:i===2?'tidy.shelf':'tidy.box'}:{})}));
  return p;
}
const packs=[make('picnic','和 Momo 去野餐',[['apple','苹果','fruit'],['banana','香蕉','fruit'],['bread','面包','food'],['milk','牛奶','drink']],4,4,'listen-pack'),
  make('tidy','和 Momo 整理玩具',[['ball','球','toy'],['car','小汽车','toy'],['teddy','小熊玩偶','toy']],2,2,'select-place')];
const dir=path.join(__dirname,'static','dev','content');fs.mkdirSync(dir,{recursive:true});
for(const p of packs)fs.writeFileSync(path.join(dir,p.sceneId+'.json'),JSON.stringify(p,null,2)+'\n');
