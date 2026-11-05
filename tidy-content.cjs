// Development content shared by the normal preview and the isolated demonstration.
function completeTidy(pack){
  if(pack.sceneId!=='tidy')return pack;
  pack.contentVersion='0.3.0';pack.compatibleFrom=[];
  pack.assets=pack.assets.filter(a=>!a.id.includes('.story.'));
  const lines=[
    ['Our toys are on the floor.','Let us put the ball in the toy box.','玩具散落在地板上。我们先把球放进玩具箱。'],
    ['Here is our little car.','The car goes in the toy box, too.','小汽车也找到家啦，轻轻放进玩具箱。'],
    ['Teddy needs a cosy home.','Let us put teddy on the shelf.','最后把小熊玩偶放上架子。玩具都有自己的家啦。']
  ];
  const characters=pack.modules.story[0].characters;
  pack.modules.story=pack.words.map((word,i)=>{
    const id='tidy.story.'+(i+1),[intro,item,translation]=lines[i];
    const segments=[intro,item].map((text,j)=>{
      const sid=id+(j===0?'.intro':'.item'),audio=sid+'.audio';
      pack.assets.push({id:audio,kind:'audio',path:'audio/tidy/v03/'+audio+'.wav',text,language:'en-US',role:'momo',source:null,rights:null,reviewed:false});
      return {id:sid,text,audio};
    });
    return {id,title:(i+1)+'. '+word.cn,templateId:'tidy-room',characters:[...characters],mainWord:word.id,hotspots:[{word:word.id,x:.72,y:.65}],translation,segments};
  });
  return pack;
}
module.exports={completeTidy};
