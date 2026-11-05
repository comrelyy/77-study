// Narrative revision: setup -> discovery -> small difficulty -> cooperation -> resolution.
// Each scene includes narration and an actual exchange; speaker IDs stay stable.
const stories={
 dressing:[
  ['shirt','风来敲窗','The wind taps the window.','momo','Let us go out! Where is my shirt?','bunny','Here it is. I will bring mine too.','风敲着窗。Momo 想出门，Lulu 找来上衣，也准备好自己的衣服。'],
  ['socks','少了一只袜子','One sock is missing.','momo','I have one sock. Where is the other?','bunny','Look under the chair. There it is!','Momo 只有一只袜子。Lulu 往椅子下看，发现了另一只。'],
  ['shoes','鞋子不舒服','Momo tries a few steps.','momo','My shoes feel funny.','bunny','Let us swap them. Try walking again.','走了几步，Momo 觉得鞋子怪怪的。两人把鞋子换过来，再试一次。'],
  ['hat','我也试试看','Lulu brings the hat.','bunny','Would you like some help?','momo','I will try first. Please stay here.','Lulu 拿来帽子，问要不要帮忙。Momo 想先自己试试，也请朋友陪在旁边。'],
  ['shirt','朋友也需要帮助','Lulu pulls at a sleeve.','bunny','My shirt is stuck. Help me, please.','momo','I can hold it. Pull gently.','这次轮到 Lulu 的袖子卡住了。Momo 帮忙扶好，两人轻轻拉一拉。'],
  ['shoes','我们都准备好了','Both friends stand by the door.','momo','Shirt, socks, shoes, hat. Ready?','bunny','Ready! Let us walk together.','两个朋友互相检查上衣、袜子、鞋子和帽子，一起准备出门。']
 ],
 washing:[
  ['water','带着泥点回来了','The friends come home with muddy hands.','momo','Look at my hands!','bunny','Mine too. Let us wash them.','玩过以后，两人的手都沾了泥。他们决定一起洗手。'],
  ['soap','泡泡太少啦','Momo picks up the soap.','momo','I cannot make bubbles.','bunny','Rub both hands together. Like this.','Momo 拿起肥皂，却搓不出泡泡。Lulu 示范双手一起搓。'],
  ['water','泡泡冲走了','Little bubbles slide towards the sink.','momo','The bubbles are going away!','bunny','Yes. Now turn off the water.','清水冲走泡泡。Lulu 提醒洗好了就关水，Momo 伸手关上水龙头。'],
  ['towel','轮到谁擦手','There is one towel beside the sink.','bunny','Your turn first. I can wait.','momo','Thank you. Now it is your turn.','洗手台边有一条毛巾。Lulu 让 Momo 先擦，Momo 擦好后交给朋友。'],
  ['toothbrush','找到各自的牙刷','Two toothbrushes wait in a cup.','momo','Is this your toothbrush?','bunny','Yes. That one is yours.','杯子里有两把牙刷。两人分清各自的牙刷，不拿错朋友的。'],
  ['towel','用品回到原处','The sink is clean again.','momo','Soap here, toothbrush there. All done?','bunny','The towel needs its hook. Now we are done!','他们把肥皂、牙刷放好。Lulu 发现毛巾还没挂，两人一起完成最后一步。']
 ],
 breakfast:[
  ['cup','早餐桌上少了什么','The table is almost ready.','momo','Bread, egg... something is missing.','bunny','Our cup! I will bring it.','早餐快准备好了。Momo 检查餐桌，Lulu 发现还少了杯子。'],
  ['bread','这块面包给你','Lulu has bread, but Momo has none.','momo','May I have some bread?','bunny','Of course. This piece is for you.','Lulu 面前有面包，Momo 还没有。Momo 开口请求，Lulu 分一块给朋友。'],
  ['milk','慢慢倒，别着急','A grown-up helps pour the milk.','momo','A little milk, please.','bunny','Say stop when you have enough.','大人帮忙倒牛奶。Momo 要一点点，Lulu 提醒够了就说停。'],
  ['egg','鸡蛋先等一等','An egg is still warm.','bunny','Can we eat it now?','momo','Let us check and wait a little.','鸡蛋还有些热。Lulu 想吃，Momo 提议先检查、等一会儿。'],
  ['bread','说够了也可以','There is another piece of bread.','bunny','Would you like more?','momo','No, thank you. I have enough.','Lulu 想再分一块面包，Momo 表达已经吃够，朋友接受这个选择。'],
  ['cup','一起收拾早餐桌','Breakfast is finished.','momo','I will carry the cup with help.','bunny','I will put the bread away. Teamwork!','早餐结束。Momo 请人帮忙端杯子，Lulu 收好面包，两人一起收拾。']
 ],
 tidy:[
  ['ball','球滚不动了','The friends want to roll a ball.','momo','The floor is full of toys!','bunny','Let us make some space together.','朋友们想滚球，地上却全是玩具。他们决定一起整理出一块空地。'],
  ['ball','球先回家','Momo carries the ball to the box.','momo','In the box?','bunny','Yes. I will hold the lid for you.','Momo 把球拿到玩具箱边，Lulu 帮忙扶住箱盖。'],
  ['car','汽车藏在哪里','A car is hiding under a cushion.','bunny','I found the car!','momo','Here is a space beside the ball.','Lulu 在靠垫下面找到小汽车，Momo 在球旁边腾出一个位置。'],
  ['teddy','小熊想坐高一点','Teddy is too big for the small space.','momo','Teddy does not fit here.','bunny','The shelf has room. Let us ask for help.','箱子里剩下的位置放不下小熊玩偶。Lulu 想到架子上还有空位，两人请人帮忙。'],
  ['car','还有一辆没发现','Momo looks around once more.','momo','Wait! Another car by your foot.','bunny','Thank you. I will put it away.','Momo 又检查一遍，发现 Lulu 脚边还藏着一辆汽车。Lulu 把它也放好。'],
  ['ball','现在可以一起玩了','There is a clear space on the floor.','bunny','Shall we take out just the ball?','momo','Yes! We can put it back after playing.','空地整理出来了。这次只取出球来玩，结束后再一起放回去。']
 ],
 picnic:[
  ['apple','苹果滚走了','An apple rolls out of the picnic basket.','momo','Oh! Our apple!','bunny','I can catch it. Here you are.','刚铺好野餐垫，一只苹果滚出篮子。Lulu 帮 Momo 接住它。'],
  ['banana','谁想吃香蕉','Lulu takes out a banana.','bunny','Would you like this banana?','momo','Yes, please. You can have the apple.','Lulu 拿出香蕉，两人商量各自想吃的水果。'],
  ['bread','面包只有一大块','There is one big piece of bread.','momo','How can we both have some?','bunny','We can share it. Half for each of us.','篮子里只有一大块面包。Lulu 提议分成两份，两人都有得吃。'],
  ['milk','现在不想喝','Lulu offers Momo some milk.','bunny','Some milk?','momo','Not now, thank you. Maybe later.','Lulu 邀请 Momo 喝牛奶。Momo 现在不想喝，礼貌拒绝，朋友也不催促。'],
  ['apple','朋友还没吃到呢','Lulu has been helping with the basket.','momo','Your apple is waiting. Sit beside me.','bunny','Thank you! Now we can eat together.','Lulu 一直忙着帮忙。Momo 注意到她还没吃，邀请朋友坐下一起享用。'],
  ['bread','把草地留干净','The picnic is over.','momo','I will pack the bread away.','bunny','I will carry the basket. See you, picnic spot!','野餐结束，Momo 收好面包，Lulu 拎起篮子，两人把草地留得干干净净。']
 ],
 park:[
  ['tree','树下有个好地方','The friends arrive at the park.','momo','It is sunny. Where can we sit?','bunny','Under this tree. There is shade.','到了公园，太阳有点晒。Lulu 找到大树下的阴凉处。'],
  ['flower','花留在这里吧','A flower grows beside the path.','momo','Can we take it home?','bunny','Let it grow. We can visit again.','Momo 想把花带回家，Lulu 提议让它继续长，下次还可以来看。'],
  ['bird','先停下来听一听','A bird sings in the tree.','bunny','Can you hear that?','momo','Yes! Let us be quiet and listen.','树上有小鸟唱歌。两人停下来，安静地听一会儿。'],
  ['ball','我们轮流来','Momo holds the ball for a long time.','bunny','May I have a turn?','momo','Yes. I roll it to you. Your turn!','Momo 抱着球玩了好一会儿。Lulu 表达也想玩，Momo 把球滚给朋友。'],
  ['ball','球滚到路边了','The ball rolls beside the path.','momo','I want to run after it!','bunny','Stay with me. Let us ask for help.','球滚到了路边。Momo 想去追，Lulu 请朋友留在身边，一起请大人帮忙。'],
  ['bird','和公园说再见','It is time to leave the park.','momo','Goodbye, bird. Goodbye, tree!','bunny','We can bring our ball another day.','离开前，两人向小鸟和大树道别，约好下次再带球来玩。']
 ],
 shopping:[
  ['bag','清单还没看呢','Momo picks up the shopping bag.','momo','Let us buy lots of fruit!','bunny','First, let us read our list.','Momo 想买好多水果。Lulu 提醒先带上袋子，再和大人一起看清单。'],
  ['apple','只要一个苹果','There are many apples on the shelf.','momo','Two apples? Three?','bunny','Our list says one. Let us choose one.','架子上有很多苹果。Lulu 和 Momo 对照清单，选出需要的一个。'],
  ['banana','香蕉在哪里','The banana shelf looks empty at first.','bunny','I cannot find a banana.','momo','Look beside the apples. There is one!','Lulu 一开始没看到香蕉。Momo 换个方向观察，在苹果旁边找到了。'],
  ['coin','轮到我们付钱','A grown-up keeps the coin for paying.','momo','Is it our turn?','bunny','Not yet. We can wait here together.','大人保管着付款的硬币。前面还有人，两人一起等候轮到自己。'],
  ['bag','袋子不要装太满','The fruit goes into the bag.','bunny','This bag feels heavy.','momo','I can help you carry it.','水果装好后，Lulu 觉得袋子有些重。Momo 主动帮忙，两人一起拿。'],
  ['apple','回家一起分享','The friends arrive home with their fruit.','momo','One apple and one banana. We did it!','bunny','Now let us share them.','回到家，朋友们检查买回的苹果和香蕉，准备一起分享。']
 ],
 bedtime:[
  ['book','两个人想读不同的书','The sky is getting dark.','momo','I want this book.','bunny','I want that one. Can we choose together?','天慢慢黑了。两人想读不同的书，于是坐下来一起商量。'],
  ['book','你一页，我一页','The friends choose a book together.','bunny','You turn this page. I will turn the next.','momo','Good idea. Let us take turns.','他们选好一本书，决定你翻一页、我翻一页，一起看故事。'],
  ['teddy','小熊玩偶不见了','Teddy is not on the bed.','momo','I cannot find teddy.','bunny','Look behind the cushion. I can help.','Momo 找不到小熊玩偶。Lulu 陪着一起找，在靠垫后面发现了它。'],
  ['bed','舒服的小床','The blanket is twisted on the bed.','momo','My bed feels bumpy.','bunny','Let us smooth the blanket together.','床上的被子卷在一起，Momo 躺着不舒服。两人一起把被子铺平。'],
  ['lamp','灯光听你的','The lamp is still bright.','bunny','Would you like it dimmer?','momo','A little, please. Leave it on for now.','灯还有点亮。Momo 想调暗一点，也表达暂时不想关掉。'],
  ['teddy','我想有人陪一会儿','Everything is ready for resting.','momo','Please stay with me a little.','bunny','I will call our grown-up. Goodnight, friend.','睡前都准备好了，Momo 还想有人陪一会儿。Lulu 帮忙请来大人，再轻轻道晚安。']
 ]
};

function applyNarrative(pack){
  const rows=stories[pack.sceneId];if(!rows)return pack;
  const {audio}=require('./launch-content.cjs');
  pack.contentVersion=pack.sceneId==='picnic'?'0.4.0':pack.sceneId==='tidy'?'0.5.0':['cooking','transport','weather','gardening'].includes(pack.sceneId)?'0.1.0':'0.2.0';
  pack.compatibleFrom=[];
  pack.assets=pack.assets.filter(a=>!a.id.includes('.story.'));
  for(const role of ['fox','turtle'])if(!pack.assets.some(a=>a.id===pack.sceneId+'.'+role))pack.assets.push({id:pack.sceneId+'.'+role,kind:'image',path:'illustrations/'+role+'.svg'});
  pack.modules.story=rows.map(([word,title,narration,a,lineA,b,lineB,translation],i)=>{
    const id=pack.sceneId+'.story.'+(i+1),main=pack.words.find(w=>w.text===word);
    if(!main)throw Error('Unknown story word: '+pack.sceneId+' '+word);
    const illustration=id+'.image';pack.assets.push({id:illustration,kind:'image',path:`illustrations/scenes/${pack.sceneId}-${i+1}.svg`});
    return {id,title:(i+1)+'. '+title,templateId:pack.sceneId==='picnic'?'picnic-meadow':pack.sceneId==='tidy'?'tidy-room':'daily-life',illustration,
      characters:[pack.sceneId+'.'+a,pack.sceneId+'.'+b],mainWord:main.id,hotspots:[{word:main.id,x:.5,y:.6}],translation,
      segments:[['narrator',narration],[a,lineA],[b,lineB]].map(([speaker,text],j)=>{const sid=id+'.'+['intro','item','reply'][j];return {id:sid,text,speaker,audio:audio(pack,sid,text,speaker)};})};
  });
  return pack;
}
function applyGames(pack){
  const id=pack.sceneId;
  const resolve=key=>pack.words.find(w=>w.text===key)?.id;
  if(['dressing','park','weather','transport'].includes(id)){
    const illustration=id+'.game.image';pack.assets.push({id:illustration,kind:'image',path:'illustrations/scenes/'+id+'-game.svg'});
    const xy=({dressing:[[.19,.32],[.81,.76],[.25,.81],[.79,.26]],park:[[.19,.43],[.8,.75],[.47,.20],[.5,.8]],weather:[[.18,.20],[.74,.22],[.32,.68],[.79,.76]],transport:[[.68,.30],[.22,.26],[.79,.79],[.24,.77]]})[id];
    pack.modules.game={type:'scene-find',title:'在'+({dressing:'出门的小房间',park:'公园',weather:'天气观察角',transport:'车站'}[id])+'里找一找',
      instructions:'先听完英语，再在大图里找对应物品。可以重听、请朋友示范或跳过。',illustration,
      hotspots:pack.words.map((w,i)=>({word:w.id,x:xy[i][0],y:xy[i][1]})),
      questions:pack.words.map((w,i)=>({id:id+'.game.'+(i+1),target:w.id,options:pack.words.map(w=>w.id)}))};
  }
  const orders={
    washing:[['把洗手的过程接起来：先搓肥皂，再冲净泡泡，最后擦干手。',['soap','water','towel'],['搓搓肥皂','冲净泡泡','擦干小手']]],
    breakfast:[['按朋友商量的计划摆早餐：先分面包，再摆鸡蛋，最后端杯子。',['bread','egg','cup'],['分享面包','摆好鸡蛋','端来杯子']]],
    bedtime:[['把今晚的睡前故事接起来：先一起看书，再抱好小熊，最后调暗灯光。',['book','teddy','lamp'],['一起读书','抱好小熊','调暗台灯']]],
    cooking:[['按准备点心的步骤来：先拿碗，再放番茄，最后用勺子拌一拌。',['bowl','tomato','spoon'],['拿好碗','放入番茄','用勺子搅拌']]],
    gardening:[['按种植计划来：先准备花盆，再放种子，最后浇一点水。',['pot','seed','water'],['准备花盆','放入种子','浇一点水']]]
  };
  if(orders[id])pack.modules.game={type:'story-order',title:'把我们的故事接起来',instructions:'听完故事后，按提示选卡片排顺序。可以撤回、请朋友示范或跳过。',questions:orders[id].map(([instructions,keys,labels],i)=>{
    const solution=keys.map(resolve);if(solution.some(w=>!w))throw Error('Missing order word');
    return {id:id+'.game.'+(i+1),target:solution.at(-1),options:solution,solution,instructions,labels:Object.fromEntries(solution.map((w,i)=>[w,labels[i]]))};
  })};
  const hooks={dressing:[1,2,3,4],washing:[4],breakfast:[5],cooking:[5],tidy:[2,3,4],picnic:[3,3,4,5],park:[1,2,3,4],transport:[1,2,3,4],shopping:[2,4,5,5],weather:[1,2,3,4],gardening:[3],bedtime:[5]};
  pack.interaction={gameAfterDialogue:hooks[id],separateGameEntry:false};
  return pack;
}
module.exports={stories,applyNarrative,applyGames};
