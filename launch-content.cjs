// Authored first-season content. Keep wording here, not in generated packages.
// A word tuple is [global ID, English, Chinese, illustration].
// A story tuple is [main word index, title, two English lines, Chinese meaning].
// A dialogue tuple is [question, meaning, [reply, meaning, follow-up, image word index]...].
const words={
  shirt:['en.shirt.clothing','shirt','上衣','shirt'], socks:['en.socks.clothing','socks','袜子','socks'],
  shoes:['en.shoes.clothing','shoes','鞋子','shoes'], hat:['en.hat.clothing','hat','帽子','hat'],
  water:['en.water.drink','water','水','water'], soap:['en.soap.wash','soap','肥皂','soap'],
  towel:['en.towel.wash','towel','毛巾','towel'], toothbrush:['en.toothbrush.wash','toothbrush','牙刷','toothbrush'],
  milk:['en.milk.drink','milk','牛奶','milk'], bread:['en.bread.food','bread','面包','bread'],
  egg:['en.egg.food','egg','鸡蛋','egg'], cup:['en.cup.container','cup','杯子','cup'],
  tree:['en.tree.plant','tree','树','tree'], flower:['en.flower.plant','flower','花','flower'],
  bird:['en.bird.animal','bird','小鸟','bird'], ball:['en.ball.toy','ball','球','ball'],
  apple:['en.apple.fruit','apple','苹果','apple'], banana:['en.banana.fruit','banana','香蕉','banana'],
  bag:['en.bag.container','bag','袋子','bag'], coin:['en.coin.money','coin','硬币','coin'],
  book:['en.book.object','book','书','book'], bed:['en.bed.furniture','bed','床','bed'],
  lamp:['en.lamp.object','lamp','台灯','lamp'], teddy:['en.teddy.toy','teddy','小熊玩偶','teddy']
};
const seasons=[
  {id:'dressing',title:'和 Momo 准备出门',goal:'表达穿戴需求，尝试自己做并请求帮助',keys:['shirt','socks','shoes','hat'],function:'I need … / Help me, please.',revisit:['please','help'],
   gameTitle:'帮 Momo 整理出门的衣物',zones:['衣柜','鞋架'],destinations:[0,0,1,0],
   story:[
    [0,'风来敲窗','The wind taps our window.','Momo finds a shirt for our walk.','风轻轻敲窗，Momo 找来出门穿的上衣。'],
    [1,'少了一只袜子','One sock is hiding under the chair.','Lulu finds it. Now we have two socks!','一只袜子藏在椅子下，Lulu 找到了它，两只袜子凑齐啦。'],
    [2,'鞋子穿反啦','Momo puts the shoes on the wrong feet.','Let us swap them and try again.','Momo 把鞋子穿反了，换过来再试一次就好。'],
    [3,'门边的帽子','Our hat is waiting by the door.','Lulu helps Momo put it on.','帽子就在门边，Lulu 帮 Momo 戴好它。'],
    [2,'准备好啦','Shirt, socks, shoes, and hat. We are ready!','We open the door and walk together.','衣服、袜子、鞋子和帽子都好了，我们一起出门。']
   ],dialogue:[
    ['Shall we get ready for our walk?','我们准备出门散步好吗？',['Yes! I need my shirt.','好呀，我需要上衣。','Here is your shirt. Let us get dressed.',0],['Help me, please.','请帮帮我。','Of course. We can get ready together.',0]],
    ['Where is the other sock?','另一只袜子在哪里？',['Under the chair!','在椅子下面！','You found it. Now we have two socks.',1],['Let us look together.','我们一起找。','I will look beside the chair.',1]],
    ['Are your shoes comfortable?','鞋子穿着舒服吗？',['These feel funny.','感觉怪怪的。','Let us check which shoe goes on each foot.',2],['Help me swap them, please.','请帮我把鞋子换过来。','I can help. We can try again.',2]],
    ['Would you like your hat?','你想戴帽子吗？',['Yes, my hat, please.','想，请给我帽子。','Here it is. Shall I help you?',3],['I can put it on.','我能自己戴上。','Go ahead. I am here if you need help.',3]],
    ['Shall we check before we go?','出门前我们检查一下好吗？',['Shirt, socks, shoes, and hat!','上衣、袜子、鞋子和帽子！','Everything is ready for our walk.',0],['My shoes need help.','我的鞋子还需要弄一下。','We can stop and fix them first.',2]],
    ['Are you ready to open the door?','准备好开门了吗？',['Yes! Let us go together.','好啦，我们一起走。','Let us ask our grown-up to come too.',3],['Please wait for me.','请等等我。','We can wait. Take your time.',1]]
   ]},
  {id:'washing',title:'和 Momo 洗漱啦',goal:'理解洗漱先后顺序，表达需要与不舒服',keys:['water','soap','towel','toothbrush'],function:'I need … / A little …, please.',revisit:['help','please'],
   gameTitle:'把洗漱用品放回合适的位置',zones:['洗手台','毛巾挂钩'],destinations:[0,0,1,0],
   story:[
    [0,'先试试水温','Our hands are muddy after playing.','A grown-up checks the water with us.','玩过之后手脏了，大人陪我们先试试水温。'],
    [1,'泡泡出来啦','Momo rubs soap between both hands.','Tiny bubbles cover the muddy spots.','Momo 搓搓肥皂，小泡泡盖住手上的泥点。'],
    [0,'泡泡去旅行','Clean water carries the bubbles away.','Lulu turns off the tap when we finish.','清水把泡泡冲走，洗好后 Lulu 关上水龙头。'],
    [2,'擦干小手','The towel is hanging beside us.','We dry our hands and hang it back.','毛巾就在旁边，擦干手以后把毛巾挂回去。'],
    [3,'牙刷也准备好','Our toothbrush is ready for brushing time.','We ask our grown-up to help us brush.','牙刷也准备好了，刷牙时请大人来帮忙。']
   ],dialogue:[
    ['Shall we wash our muddy hands?','我们洗洗沾了泥的手好吗？',['Yes, some water, please.','好，请放一点水。','Let us ask our grown-up to check the water.',0],['Please help me reach.','请帮我够到洗手台。','I will call our grown-up to help.',0]],
    ['What do we need for the bubbles?','我们用什么搓泡泡呢？',['A little soap, please.','请给我一点肥皂。','Rub your hands together with the soap.',1],['Can you show me?','你能示范一下吗？','Watch my hands. We can rub them together.',1]],
    ['How does the water feel?','水感觉怎么样？',['It feels comfortable.','感觉很舒服。','Good. We can rinse the bubbles away.',0],['It feels too hot.','感觉太烫了。','Stop and ask our grown-up for help.',0]],
    ['Where can we dry our hands?','我们在哪里擦干手呢？',['With the towel.','用毛巾擦。','Here it is. Pat your hands dry.',2],['My hands are still wet.','我的手还湿着。','We can use the towel again.',2]],
    ['Where does the towel go now?','毛巾用完放在哪里？',['Back on the hook.','挂回挂钩上。','Yes. We leave it hanging to dry.',2],['Help me hang it, please.','请帮我挂好。','I can help you reach the hook.',2]],
    ['Is your toothbrush ready?','你的牙刷准备好了吗？',['Yes! Help me brush, please.','好啦，请帮我刷牙。','Let us ask our grown-up to help.',3],['Please wait a moment.','请等一下。','We can take a moment before brushing.',3]]
   ]},
  {id:'breakfast',title:'和 Momo 吃早餐',goal:'表达食物偏好、拒绝与用餐需要',keys:['bread','milk','egg','cup'],function:'Some …, please. / No, thank you.',revisit:['bread','milk'],
   gameTitle:'把早餐用品摆到桌上',zones:['餐盘','杯垫'],destinations:[0,1,0,1],
   story:[
    [3,'桌上少了什么','Breakfast is almost ready.','Momo brings a cup to the table.','早餐快好了，Momo 把杯子拿到桌上。'],
    [0,'一起分面包','There is bread for both friends.','Lulu shares a piece with Momo.','面包够两个朋友吃，Lulu 分一块给 Momo。'],
    [1,'慢慢倒牛奶','Momo asks for a little milk.','A grown-up helps pour it into the cup.','Momo 想喝一点牛奶，大人帮忙倒进杯子里。'],
    [2,'还想吃什么','A warm egg is on the plate.','Momo waits until it is cool enough.','餐盘上有一只温热的鸡蛋，Momo 等它凉一点再吃。'],
    [3,'早餐结束啦','We have had enough breakfast.','We carry our cup back with help.','早餐吃饱了，我们请人帮忙把杯子收回去。']
   ],dialogue:[
    ['Would you like some bread?','你想吃一点面包吗？',['Some bread, please.','请给我一点面包。','Here is a piece for you.',0],['No, thank you.','不用了，谢谢。','That is okay. You can choose something else.',0]],
    ['What would you like in your cup?','你的杯子里想装什么？',['A little milk, please.','请给我一点牛奶。','Our grown-up can help us pour it.',1],['No milk, thank you.','不喝牛奶，谢谢。','That is okay. Tell our grown-up what you need.',3]],
    ['Shall we share this bread?','我们分享这块面包好吗？',['Yes, a small piece, please.','好，请给我一小块。','I will put your piece on your plate.',0],['I have enough, thank you.','我已经够了，谢谢。','You can stop whenever you have had enough.',0]],
    ['Would you like the egg now?','你现在想吃鸡蛋吗？',['Is it too hot?','它会不会太烫？','Let us check with our grown-up first.',2],['I will wait a little.','我想等一会儿。','We can wait until it is comfortable to eat.',2]],
    ['Can you pass the cup, please?','你能递一下杯子吗？',['Here you are.','给你。','Thank you. I will hold it with both hands.',3],['Please help me carry it.','请帮我拿过去。','Let us carry it carefully together.',3]],
    ['Have you had enough breakfast?','早餐吃够了吗？',['Yes, thank you.','够了，谢谢。','Let us put our things away.',3],['A little more bread, please.','请再给我一点面包。','Here is another small piece.',0]]
   ]},
  {id:'park',title:'和 Momo 逛公园',goal:'观察和指认自然事物，轮流游戏',keys:['tree','flower','bird','ball'],function:'I can see … / Your turn.',revisit:['ball','help'],
   gameTitle:'听一听，找找公园里的朋友',
   story:[
    [0,'大树下的阴凉','We walk into the park with our grown-up.','A tall tree gives us a shady spot.','我们和大人一起到公园，大树下有一片阴凉。'],
    [1,'留给大家看的花','Lulu finds a flower beside the path.','We look closely and leave it growing.','Lulu 发现路边的花，我们凑近看看，让它继续生长。'],
    [2,'是谁在唱歌','A bird sings above our heads.','We stop and listen under the tree.','头顶有小鸟唱歌，我们停在树下听一听。'],
    [3,'轮到你啦','Momo rolls a ball to Lulu.','Lulu rolls it back. Now it is your turn!','Momo 把球滚给 Lulu，Lulu 滚回来，现在轮到你啦。'],
    [3,'球滚远了','Our ball rolls beside the path.','We stay together and ask our grown-up for help.','球滚到路边，我们留在一起，请大人帮忙拿回来。']
   ],dialogue:[
    ['What can you see above us?','你能看见我们上方有什么？',['I can see a tree.','我能看见一棵树。','Its leaves make a shady spot for us.',0],['Let us look together.','我们一起看看。','Look up beside me. There are green leaves.',0]],
    ['Shall we look at this flower?','我们看看这朵花好吗？',['Yes! Leave it growing.','好呀，让它继续长。','We can enjoy it without picking it.',1],['Let us look from here.','我们在这里看吧。','This is a good place to look.',1]],
    ['Can you hear the bird?','你能听见小鸟吗？',['Yes! Up in the tree.','能，在树上。','Let us stay quiet and listen.',2],['Please wait. I am listening.','等等，我在听。','We can listen together for a moment.',2]],
    ['Would you like to roll the ball?','你想滚球吗？',['Yes! My turn, please.','想，请轮到我。','Here comes the ball. Roll it back when ready.',3],['You go first.','你先来。','I will roll it gently towards you.',3]],
    ['Our ball rolled away. What can we do?','球滚远了，我们怎么办？',['Ask our grown-up for help.','请大人帮忙。','We will stay here together while they help.',3],['Please stay with me.','请陪着我。','I will stay beside you.',3]],
    ['What shall we say before we leave?','离开前我们说什么呢？',['Goodbye, bird!','再见，小鸟！','We can visit the park another day.',2],['Goodbye, tree and flower!','再见，大树和花朵！','Thank you for a lovely afternoon.',0]]
   ]},
  {id:'shopping',title:'和 Momo 逛小商店',goal:'提出购买需求、选择数量并礼貌致谢',keys:['apple','banana','bag','coin'],function:'…, please. / Here you are.',revisit:['apple','banana'],
   gameTitle:'听清单，把需要的东西找出来',collection:'basket',
   story:[
    [2,'带上自己的袋子','We bring a bag to the little shop.','Our grown-up helps us read the shopping list.','我们带着袋子到小商店，大人陪我们看购物清单。'],
    [0,'先找苹果','The list says one apple.','Momo chooses an apple with gentle hands.','清单上写着一个苹果，Momo 轻轻拿起一个。'],
    [1,'再找香蕉','Lulu spots a banana on the next shelf.','Now we have the fruit on our list.','Lulu 在旁边的架子上找到香蕉，清单上的水果齐啦。'],
    [3,'一起付钱','Our grown-up keeps the coin for paying.','We watch them pay the shopkeeper.','大人保管付款的硬币，我们一起看大人付钱。'],
    [2,'谢谢，再见','We put the fruit in our bag.','Thank you! We carry it home together.','我们把水果装进袋子，说声谢谢，一起带回家。']
   ],dialogue:[
    ['What shall we bring to the shop?','去商店要带什么呢？',['Our bag, please.','带上我们的袋子。','We can use it to carry our fruit.',2],['Help me read the list.','帮我看看清单。','Let us read it with our grown-up.',2]],
    ['What fruit would you like first?','你先想拿什么水果？',['An apple, please.','请给我一个苹果。','Let us choose one apple from the shelf.',0],['A banana, please.','请给我一根香蕉。','Let us look on the next shelf.',1]],
    ['How many apples are on our list?','清单上要几个苹果？',['One apple, please.','请拿一个苹果。','One apple. That is what our list says.',0],['Let us check together.','我们一起检查。','Our grown-up can help us read the list.',0]],
    ['Have we found the banana?','我们找到香蕉了吗？',['Yes, here it is.','找到了，在这里。','We have both kinds of fruit now.',1],['Please help me find it.','请帮我找一找。','Look beside the apples. I will help you.',1]],
    ['Who will keep the coin for paying?','谁来保管付款的硬币呢？',['Our grown-up will.','让大人保管。','We can watch our grown-up pay.',3],['Let us ask our grown-up.','我们问问大人。','They will help us pay the shopkeeper.',3]],
    ['What shall we say to the shopkeeper?','我们对店员说什么呢？',['Thank you. Goodbye!','谢谢，再见！','Let us carry our bag home together.',2],['Thank you for the fruit!','谢谢你给我们水果！','The fruit is ready to share at home.',0]]
   ]},
  {id:'bedtime',title:'和 Momo 道晚安',goal:'表达睡前偏好与陪伴需要，理解简单位置',keys:['book','bed','lamp','teddy'],function:'One more …, please. / Stay with me.',revisit:['teddy','help','please'],
   gameTitle:'帮 Momo 收拾安静的睡前角落',zones:['书架','床边'],destinations:[0,1,1,1],
   story:[
    [0,'选一本书','The sky is getting dark.','Momo chooses a book to read with Lulu.','天慢慢黑了，Momo 选一本书和 Lulu 一起看。'],
    [3,'小熊玩偶在哪里','Our teddy is hiding behind a cushion.','Lulu finds it and gives it a cuddle.','小熊玩偶藏在靠垫后面，Lulu 找到它，轻轻抱一抱。'],
    [1,'把床铺舒服','Momo pulls the blanket over the bed.','There is a cosy place for teddy too.','Momo 把被子铺好，床上也给小熊玩偶留一个舒服的位置。'],
    [2,'灯光轻一点','Our grown-up turns the lamp down.','The room becomes soft and quiet.','大人把灯光调暗一点，房间安静又柔和。'],
    [1,'有人陪着你','Momo asks our grown-up to stay nearby.','Goodnight, friends. We can rest in our own time.','Momo 请大人在身边陪一会儿。朋友们晚安，按自己的节奏休息。']
   ],dialogue:[
    ['Which book shall we read tonight?','今晚我们读哪本书呢？',['This book, please.','请读这一本。','Let us sit together and open it.',0],['Please help me choose.','请帮我选一本。','We can look at the covers together.',0]],
    ['Where is our teddy?','我们的小熊玩偶在哪里？',['Behind the cushion!','在靠垫后面！','You found teddy. Let us give it a cuddle.',3],['Please look with me.','请陪我一起找。','I will look beside the bed with you.',3]],
    ['Is your bed comfortable?','你的床舒服吗？',['Yes, teddy is here too.','舒服，小熊也在这里。','There is a cosy place for both of you.',1],['Help me with the blanket.','帮我弄弄被子。','Let us ask our grown-up to help.',1]],
    ['Would you like the lamp a little dimmer?','你想让灯光暗一点吗？',['A little dimmer, please.','请调暗一点。','Our grown-up can adjust the lamp.',2],['Please leave it on.','请先让它亮着。','Tell our grown-up what feels comfortable.',2]],
    ['Shall we close our book now?','我们现在把书合上好吗？',['One more page, please.','请再读一页。','We can ask our grown-up to read one more.',0],['Yes. Goodnight, book!','好，书本晚安！','We can put it back on the shelf.',0]],
    ['Would you like someone to stay nearby?','你想有人在旁边陪着吗？',['Stay with me, please.','请陪着我。','Let us ask our grown-up to stay close.',1],['Goodnight. I am ready to rest.','晚安，我准备休息了。','Goodnight. Take your time and get comfortable.',3]]
   ]}
];

function audio(pack,id,text,role='momo'){
  const a={id:id+'.audio',kind:'audio',path:`audio/${pack.sceneId}/v${pack.contentVersion.replaceAll('.','-')}/${id}.audio.wav`,text,language:'en-US',role,source:null,rights:null,reviewed:false};
  pack.assets.push(a);return a.id;
}
function story(pack,rows,template='daily-life'){
  pack.modules.story=rows.map(([wi,title,intro,item,translation],i)=>{
    const id=`${pack.sceneId}.story.${i+1}`,illustration=id+'.image';
    pack.assets.push({id:illustration,kind:'image',path:`illustrations/scenes/${pack.sceneId}-${i+1}.svg`});
    return {id,title:`${i+1}. ${title}`,templateId:template,illustration,characters:[pack.sceneId+'.momo',pack.sceneId+'.bunny'],mainWord:pack.words[wi].id,hotspots:[{word:pack.words[wi].id,x:.7,y:.6}],translation,
      segments:[intro,item].map((text,j)=>({id:id+'.'+(j?'item':'intro'),text,audio:audio(pack,id+'.'+(j?'item':'intro'),text)}))};
  });
}
function createPack(spec){
  const p={schemaVersion:1,sceneId:spec.id,contentVersion:'0.1.0',status:'draft',compatibleFrom:[],title:spec.title,stickerId:spec.id+'.sticker',
    learning:{goal:spec.goal,function:spec.function,revisit:spec.revisit},assets:[],words:[],modules:{}};
  for(const name of ['momo','bunny','wave'])p.assets.push({id:spec.id+'.'+name,kind:'image',path:'illustrations/'+name+'.svg'});
  p.words=spec.keys.map(key=>{const [id,text,cn,file]=words[key],image=spec.id+'.'+key+'.image';p.assets.push({id:image,kind:'image',path:'illustrations/'+file+'.svg'});return {id,text,cn,image,audio:audio(p,spec.id+'.'+key,text)};});
  story(p,spec.story);
  p.modules.dialogue=spec.dialogue.map(([q,cn,...replies],i)=>{const id=spec.id+'.dialogue.'+(i+1);return {id,cn,question:[{id:id+'.question',text:q,audio:audio(p,id+'.question',q)}],options:replies.map(([text,cn,follow,wi],j)=>{const oid=id+'.reply.'+(j+1);return {id:oid,text,cn,image:p.words[wi].image,audio:audio(p,oid,text,'bunny'),followUp:[{id:oid+'.follow',text:follow,audio:audio(p,oid+'.follow',follow)}]};})};});
  const g=p.modules.game={type:spec.zones?'select-place':'listen-pack',title:spec.gameTitle,instructions:spec.zones?'先选物品，再点合适的位置。可以换选，请人示范、跳过或结束。':'先完整听完要找的词，再点对应图片。可以重听、请人示范、跳过或结束。',
    questions:p.words.map((w,i)=>({id:spec.id+'.game.'+(i+1),target:w.id,options:p.words.map(w=>w.id),...(spec.zones?{zone:spec.id+'.zone.'+spec.destinations[i]}:{})}))};
  if(spec.zones)g.zones=spec.zones.map((label,i)=>({id:spec.id+'.zone.'+i,label}));
  if(spec.collection)g.collectionImage='illustrations/'+spec.collection+'.svg';
  p.modules.summary=p.words.map(w=>w.id);return p;
}
function enhanceExisting(p){
  p.assets=p.assets.filter(a=>!a.id.includes('.story.'));
  p.compatibleFrom=[];
  if(p.sceneId==='picnic'){
    p.contentVersion='0.3.0';p.learning={goal:'在分享食物时表达选择、接受与拒绝',function:'…, please. / No, thank you.',revisit:['bread','milk','apple','banana']};
    story(p,[
      [0,'苹果先滚出来','We spread our blanket under a tree.','An apple rolls out of our basket.','我们在树下铺好野餐垫，一只苹果从篮子里滚了出来。'],
      [1,'给朋友留一份','Lulu catches the apple and brings a banana.','There is fruit for both of us.','Lulu 接住苹果，又拿出香蕉，我们都有水果可以吃。'],
      [2,'面包分一分','Momo has bread, but Lulu has none.','Let us share it. Here is a piece for you.','Momo 有面包，Lulu 还没有。我们分一分，给朋友一块。'],
      [3,'想喝一点吗','Lulu offers Momo some milk.','No, thank you. I will have a drink later.','Lulu 问 Momo 要不要牛奶。Momo 说谢谢，现在不想喝，晚一点再喝。']
    ],'picnic-meadow');
  }else{
    p.contentVersion='0.4.0';p.learning={goal:'合作收纳，理解 in / on 并表达求助',function:'In the box. / On the shelf.',revisit:['ball','teddy','help']};
    p.assets.find(a=>a.id==='tidy.teddy.image').path='illustrations/teddy.svg';
    story(p,[
      [0,'地上都是玩具','We want to play, but toys cover the floor.','Momo puts the ball in the toy box.','我们想玩游戏，地板上却散着玩具。Momo 先把球放进玩具箱。'],
      [1,'汽车找到停车位','Lulu finds the car under a cushion.','The car goes in the toy box, too.','Lulu 在靠垫下找到小汽车，把它也放进玩具箱。'],
      [2,'小熊也有家','Teddy needs a cosy home on the shelf.','We ask for help. Now there is room to play!','小熊玩偶要放到架子上，我们请人帮忙。地上有地方玩啦！']
    ],'tidy-room');
  }
  return p;
}
module.exports={words,seasons,createPack,enhanceExisting,audio};
