// Current dialogue scripts. S1 historical samples remain unchanged.
const scripts={
  picnic:[
    ['Hello, Bunny! Shall we have a picnic?','小兔你好！我们一起野餐好吗？',[
      ['bunny','Yes! Let us have a picnic.','好呀，一起野餐！','Great! I brought our basket.'],['wave','Can I join you?','我可以加入吗？','Of course! There is room for you.']]],
    ['Where shall we sit?','我们坐在哪里呢？',[
      ['basket','Let us sit here.','我们坐在这里吧。','Here is a lovely spot for our picnic.'],['momo','Next to you, please.','我想坐在你旁边。','Come and sit beside me.']]],
    ['What would you like from our basket?','你想从篮子里拿什么？',[
      ['apple.image','An apple, please.','请给我一个苹果。','Here is your apple.'],['banana.image','A banana, please.','请给我一根香蕉。','Here is your banana.'],['wave','No food yet, thank you.','我还不想吃，谢谢。','That is okay. We can enjoy the sunshine.']]],
    ['Shall we share some bread, too?','我们也分享一点面包好吗？',[
      ['bread.image','Yes! Let us share.','好呀，一起分享。','Here is some bread for each of us.'],['wave','No, thank you.','不用了，谢谢。','That is okay. I will keep it here.']]],
    ['We have milk. Would you like a drink?','我们带了牛奶。你想喝点东西吗？',[
      ['milk.image','Some milk, please.','请给我一些牛奶。','Here is your milk. Take a little sip.'],['wave','Not now, thank you.','现在不想喝，谢谢。','All right. You can have a drink later.']]],
    ['What shall we do after our picnic?','野餐后我们做什么呢？',[
      ['bunny','Let us play together.','我们一起玩吧。','Good idea! We can play after tidying up.'],['momo','Let us tell a story.','我们讲个故事吧。','Lovely! I have a story to share.']]],
    ['Before we play, shall we tidy our picnic?','玩之前，我们把野餐的东西整理好吗？',[
      ['basket','I can carry the basket.','我可以提篮子。','Thank you! I will put our food away.'],['bunny','Let us do it together.','我们一起整理吧。','Together we can make this spot clean.']]],
    ['Thank you for our picnic. Did you enjoy it?','谢谢你一起野餐。你玩得开心吗？',[
      ['momo','Yes! Let us picnic again.','开心！下次再一起野餐。','I would love that. See you next time!'],['wave','Thank you for sharing with me.','谢谢你和我分享。','You are welcome. It is lovely sharing with you.']]]
  ],
  tidy:[
    ['Our toys are everywhere. Shall we tidy up?','玩具散落一地，我们一起整理好吗？',[
      ['ball.image','Yes! Let us do it together.','好呀，我们一起整理。','Great! Let us choose a toy first.'],['wave','Please help me.','请帮帮我。','Of course. We can start together.']]],
    ['Which toy shall we pick up first?','我们先拿起哪件玩具？',[
      ['ball.image','The ball, please.','先拿球吧。','Let us pick up the ball carefully.'],['car.image','The car, please.','先拿小汽车吧。','Let us pick up the little car.']]],
    ['Where can we put our small toys?','小玩具可以放在哪里？',[
      ['ball.image','In the toy box.','放在玩具箱里。','Yes! The toy box has room for them.'],['momo','Can you show me?','你能示范一下吗？','Here is the toy box. Put small toys inside.']]],
    ['Our teddy needs a home, too. Where shall it go?','小熊玩偶也需要一个家，放在哪里呢？',[
      ['teddy.image','On the shelf, please.','请放在架子上。','The shelf is a cosy home for teddy.'],['momo','Please help me reach the shelf.','请帮我够到架子。','I can help. Let us put teddy there together.']]],
    ['The floor is clear now. What shall we do?','地板已经整洁了，我们接下来做什么呢？',[
      ['car.image','Let us play with the car.','我们玩小汽车吧。','Yes! We can put it back after playing.'],['ball.image','Let us play with the ball.','我们玩球吧。','Yes! We have a clear space to play.']]],
    ['Thank you for helping. Shall we tidy again next time?','谢谢你帮忙，下次我们还一起整理好吗？',[
      ['momo','Yes! We are a good team.','好呀，我们是好搭档。','We are! Thank you for helping our toys find homes.'],['wave','See you next time!','下次见！','See you! Our toys will be waiting.']]]
  ]
};
function applyDialogue(pack){
  pack.contentVersion='0.2.0';pack.compatibleFrom=[];
  pack.assets=pack.assets.filter(a=>!a.id.includes('.dialogue.'));
  if(!pack.assets.some(a=>a.id===pack.sceneId+'.basket'))pack.assets.push({id:pack.sceneId+'.basket',kind:'image',path:'illustrations/basket.svg'});
  const audio=(id,text,role='momo')=>{pack.assets.push({id,kind:'audio',path:'audio/'+pack.sceneId+'/v02/'+id+'.wav',text,language:'en-US',role,source:null,rights:null,reviewed:false});return id;};
  const segment=(id,text)=>({id,text,audio:audio(id+'.audio',text)});
  const image=key=>{const id=pack.sceneId+'.'+key;return pack.assets.some(a=>a.id===id)?id:pack.sceneId+'.momo';};
  pack.modules.dialogue=scripts[pack.sceneId].map(([q,cn,answers],i)=>{const id=pack.sceneId+'.dialogue.'+(i+1);return {id,cn,question:[segment(id+'.question',q)],options:answers.map(([img,text,cn,follow],j)=>{const oid=id+'.reply.'+(j+1);return {id:oid,image:image(img),text,cn,audio:audio(oid+'.audio',text,'bunny'),followUp:[segment(oid+'.follow',follow)]};})};});
  return pack;
}
module.exports={applyDialogue};
