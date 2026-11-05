const vocabulary={
 bowl:['en.bowl.container','bowl','碗','bowl'],spoon:['en.spoon.utensil','spoon','勺子','spoon'],tomato:['en.tomato.food','tomato','番茄','tomato'],
 bus:['en.bus.vehicle','bus','公共汽车','bus'],ticket:['en.ticket.travel','ticket','车票','ticket'],seat:['en.seat.furniture','seat','座位','seat'],
 sun:['en.sun.nature','sun','太阳','sun'],rain:['en.rain.weather','rain','雨','rain'],umbrella:['en.umbrella.object','umbrella','雨伞','umbrella'],
 pot:['en.pot.garden','pot','花盆','pot'],seed:['en.seed.plant','seed','种子','seed']
};
const narratives={
 cooking:[
  ['bowl','想给朋友准备点心','Momo and Lulu are making a snack.','momo','Can we make something to share?','bunny','Yes! Let us find a bowl.','Momo 和 Lulu 想给朋友准备一份可以分享的点心，先找一个碗。'],
  ['tomato','番茄滚走了','A tomato rolls across the table.','momo','Our tomato is rolling away!','fox','I have it! Let us put it in the bowl.','番茄在桌上滚走，Fifi 及时扶住，把它放进碗里。'],
  ['spoon','勺子去哪了','The spoon is under a cloth.','bunny','We need a spoon for mixing.','turtle','Lift the cloth. Here it is.','Lulu 找不到搅拌的勺子，Toto 仔细看看，发现它藏在布下面。'],
  ['bread','给每个人留一份','There is bread on the plate.','momo','One piece for me and one for you.','fox','And one for Lulu and Toto!','Momo 给自己和 Fifi 分面包，Fifi 提醒还有 Lulu 和 Toto。'],
  ['spoon','慢一点也能拌好','Fifi stirs too quickly.','fox','Oops! It almost fell out.','turtle','Try a slow circle. I will hold the bowl.','Fifi 搅得太快，点心差点洒出来。Toto 帮忙扶碗，Fifi 放慢速度。'],
  ['bowl','我们的点心做好了','The bowl is ready on the table.','momo','We all helped. Would you like some?','bunny','Yes, please. Let us share!','大家各帮一点忙，点心准备好了。Momo 邀请朋友一起分享。']
 ],
 transport:[
  ['bus','一起去等车','Momo and Lulu arrive at the bus stop.','momo','Is our bus here yet?','bunny','Not yet. Let us wait together.','Momo 和 Lulu 到车站等车，车还没来，两人一起耐心等待。'],
  ['ticket','票放在哪里了','Momo looks inside the bag.','momo','I cannot find my ticket.','turtle','Check the small pocket. Take your time.','Momo 找不到车票有些着急，Toto 提醒看看袋子的小口袋。'],
  ['bag','别把袋子落下','The bus arrives at the stop.','fox','Our bus is here! Let us go!','momo','Wait. We need our bag too.','公交车来了，Fifi 想马上上车。Momo 提醒先拿好袋子。'],
  ['seat','这个座位有人吗','The friends step onto the bus with their grown-up.','momo','Is this seat free?','bunny','Yes. Let us sit beside each other.','两人和大人一起上车，先问好座位是否有人，再坐在一起。'],
  ['bag','给过道留出地方','A bag is in the aisle.','fox','Where can I put my bag?','turtle','Keep it beside your feet. Leave the aisle clear.','Fifi 的袋子放在过道上，Toto 提醒挪到脚边，不挡住别人。'],
  ['bus','到站再走','The bus stops at their destination.','momo','Our stop! Bag and ticket ready?','bunny','Ready. Let us leave with our grown-up.','到站停稳了，两人检查袋子和车票，跟着大人一起下车。']
 ],
 weather:[
  ['sun','先看看窗外','Momo and Lulu want to play outside.','momo','I can see the sun!','bunny','Let us look at the whole sky.','Momo 看见太阳，想出门玩。Lulu 提议把整个天空都看一看。'],
  ['cloud','云慢慢飘来了','A cloud drifts across the sky.','momo','That cloud looks like a little boat.','fox','I think it looks like a turtle!','一朵云飘过，Momo 觉得像小船，Fifi 觉得像小乌龟，两人各有想象。'],
  ['rain','窗上有小雨点','Little drops tap the window.','momo','Is that rain?','bunny','Yes. Let us change our plan.','窗上传来小雨点的声音。两人发现下雨了，决定调整出门计划。'],
  ['umbrella','雨伞还没拿','Fifi runs towards the door.','turtle','Wait! Where is your umbrella?','fox','Thank you. I nearly forgot it.','Fifi 想跑到门口，Toto 提醒雨伞还没拿。Fifi 停下来找伞。'],
  ['rain','下雨也能听故事','The friends stay inside while it rains.','momo','I wanted to play outside.','bunny','I know. Shall we tell a rainy-day story?','Momo 没能出门有点失落，Lulu 先听朋友说完，再邀请一起讲雨天故事。'],
  ['sun','天气还会变','The rain stops and sunlight returns.','momo','The sun is back!','bunny','Let us check with our grown-up before we go.','雨停了，阳光重新出现。两人先和大人确认，再决定是否出门。']
 ],
 gardening:[
  ['pot','一只空花盆','Momo and Lulu find an empty pot.','momo','What could grow in this pot?','bunny','Let us try a little seed.','两人发现一只空花盆，商量在里面种下一颗种子。'],
  ['seed','种子小小的','A seed rests in Momo\'s hand.','momo','This seed is so small!','turtle','Make a little space in the soil for it.','种子小小的。Toto 帮忙在土里留一个位置，让 Momo 轻轻放进去。'],
  ['water','浇一点点水','Fifi brings water to the pot.','fox','Shall I pour it all in?','turtle','Just a little. Pour slowly.','Fifi 想把水全倒进去，Toto 提议先浇一点点，慢慢来。'],
  ['seed','怎么还没长出来','Momo checks the pot that afternoon.','momo','I cannot see a flower yet.','bunny','Growing takes time. We can check another day.','当天下午，Momo 没看见花，有些着急。Lulu 陪着等待，约好过几天再看。'],
  ['flower','过了好多天','Many days pass. A flower finally opens.','momo','Look! Our flower is here!','fox','The little seed really grew.','过了好多天，花终于开了。Momo 和 Fifi 一起发现这个变化。'],
  ['pot','轮流照顾它','The friends make a plan for the pot.','momo','I can check it today.','bunny','I can check tomorrow. We will take turns.','两人商量轮流照顾花盆，今天 Momo 看看，明天换 Lulu。']
 ]
};
const definitions=[
 {id:'cooking',title:'和 Momo 一起做点心',goal:'合作准备与分享点心，表达数量和求助',keys:['bowl','tomato','spoon','bread'],function:'Let us … / One for …',revisit:['bread','share'],gameTitle:'把点心用品放回原处'},
 {id:'transport',title:'和 Momo 坐公共汽车',goal:'按顺序等车乘车、检查物品与表达需要',keys:['bus','ticket','bag','seat'],function:'Is this …? / Wait, please.',revisit:['bag','wait'],gameTitle:'在车站找一找'},
 {id:'weather',title:'和 Momo 看天气',goal:'观察天气变化、调整计划、表达失落与想法',keys:['sun','cloud','rain','umbrella'],function:'I can see … / Let us …',revisit:['cloud','wait'],gameTitle:'天气里藏着什么'},
 {id:'gardening',title:'和 Momo 照顾小花',goal:'理解种植先后与等待生长，轮流照顾',keys:['pot','seed','water','flower'],function:'A little … / Your turn.',revisit:['water','flower'],gameTitle:'把种植的过程接起来'}
];
const conversations={
 cooking:[
  ['What shall we make for our friends?','给朋友们准备什么呢？',['A snack to share!','一份一起吃的点心！','Let us find a bowl first.',0],['Please help me choose.','请帮我选一选。','We can look at the ingredients together.',1]],
  ['Where can we put the tomato?','番茄可以放在哪里？',['In the bowl.','放在碗里。','Yes. Put it in gently.',0],['Please hold it for me.','请帮我拿一下。','I will hold the bowl while you put it in.',0]],
  ['What can we use for mixing?','用什么搅拌呢？',['The spoon, please.','请拿勺子。','Here it is. Try a slow circle.',2],['Show me, please.','请示范一下。','I can stir slowly while you hold the bowl.',2]],
  ['Shall we share the bread?','我们分享面包好吗？',['One piece for each friend.','每个朋友一块。','Let us make sure everyone has some.',3],['I will help you share.','我来帮你分。','Thank you. We can do it together.',3]],
  ['The food almost spilled. What can we do?','点心差点洒了，怎么办呢？',['Mix more slowly.','搅慢一点。','Yes. I can help hold the bowl.',2],['Please hold the bowl.','请帮忙扶碗。','I will hold it steady for you.',0]],
  ['Our snack is ready. Would you like some?','点心准备好了，你想吃一点吗？',['Yes, please!','想，谢谢！','Here is a little for you.',0],['Not now, thank you.','现在不想，谢谢。','That is okay. You can join us later.',3]]
 ],
 transport:[
  ['Is our bus here yet?','我们的车来了吗？',['Not yet. Let us wait.','还没有，我们等等。','We can wait together at the stop.',0],['Please stay with me.','请陪着我。','I will stay beside you.',0]],
  ['Where is your ticket?','你的车票在哪里？',['In my bag.','在我的袋子里。','Check the small pocket.',1],['Please help me look.','请帮我找找。','Take your time. We can look together.',1]],
  ['The bus is here. Have we got everything?','车来了，东西都拿好了吗？',['Our bag and ticket!','袋子和车票！','Now we can go with our grown-up.',2],['Wait for my bag, please.','请等等，我拿袋子。','We can wait while you pick it up.',2]],
  ['Is this seat free?','这个座位空着吗？',['Yes. Sit here, please.','空着，请坐这里。','Thank you. We can sit beside each other.',3],['Let us ask first.','我们先问问。','Good idea. Ask before we sit.',3]],
  ['Where can we keep our bag?','我们的袋子放在哪里？',['Beside our feet.','放在脚边。','Then the aisle will stay clear.',2],['Help me move it, please.','请帮我挪一下。','We can move it together.',2]],
  ['The bus has stopped. Shall we leave?','车停稳了，我们下车吗？',['Yes, with our grown-up.','好，和大人一起。','Take your bag and ticket with you.',1],['Please wait for me.','请等等我。','We will stay together.',2]]
 ],
 weather:[
  ['What can you see outside?','你在窗外看到了什么？',['I can see the sun.','我看到了太阳。','Let us look at the rest of the sky.',0],['A cloud is coming.','一朵云飘来了。','Watch how it moves.',1]],
  ['What does that cloud look like?','那朵云看起来像什么？',['A little boat!','一只小船！','I can imagine that too.',1],['A sleepy turtle!','一只打瞌睡的小乌龟！','We can have different ideas.',1]],
  ['What is tapping the window?','是什么在敲窗户？',['It is rain.','是雨。','We may need a different plan.',2],['Let us listen together.','我们一起听听。','Tiny drops are tapping the glass.',2]],
  ['What could we bring for the rain?','下雨出门可以带什么？',['An umbrella, please.','请带上雨伞。','Ask our grown-up to help you open it.',3],['Let us stay inside.','我们先待在屋里。','We can tell a story while we wait.',2]],
  ['You wanted to go out. How do you feel?','你本来想出门，现在感觉怎样？',['I feel disappointed.','我有点失望。','I understand. I can sit with you.',2],['Tell me a story, please.','请给我讲个故事。','Let us make up a rainy-day story.',1]],
  ['The rain has stopped. What shall we do?','雨停了，我们做什么呢？',['Check with our grown-up first.','先问问大人。','Then we can decide together.',0],['Finish our story first!','先讲完我们的故事！','Yes. There is no hurry.',1]]
 ],
 gardening:[
  ['What could grow in this pot?','这个花盆里能种点什么？',['A little flower.','一朵小花。','Let us start with a seed.',3],['Can you show me?','你能示范吗？','We will make room in the soil.',0]],
  ['Where shall we put the seed?','种子放在哪里呢？',['In the soil.','放在土里。','Gently. Then cover it with a little soil.',1],['Please help me hold it.','请帮我拿一下。','We can do this together.',1]],
  ['How much water shall we pour?','我们浇多少水呢？',['Just a little.','一点点就好。','Pour slowly. We can stop when ready.',2],['Show me, please.','请示范一下。','Watch me pour a little water.',2]],
  ['Can we see a flower today?','今天能看到花吗？',['Not yet. We can wait.','还不能，我们可以等。','Growing takes more than one afternoon.',1],['I want to see it now.','我现在就想看到。','Waiting can feel hard. I will wait with you.',1]],
  ['Many days have passed. What do you see?','过了好多天，你看见了什么？',['Our flower is here!','我们的花开啦！','The little seed has grown.',3],['Come and look with me.','快来和我一起看。','I am coming. Let us look closely.',3]],
  ['Who will check the pot tomorrow?','明天谁来看花盆呢？',['My turn tomorrow!','明天轮到我！','I checked today. We can take turns.',0],['Let us make a plan.','我们一起安排。','We can share the job.',0]]
 ]
};
function addExtraThemes(){
  const {words}=require('./launch-content.cjs');
  Object.assign(words,vocabulary,{cloud:['en.cloud.weather','cloud','云','cloud']});
  Object.assign(require('./content-v2.cjs').stories,narratives);
  return definitions.map(spec=>({...spec,dialogue:conversations[spec.id],story:narratives[spec.id].map(([key,title,narration,a,lineA,b,lineB,cn])=>[spec.keys.indexOf(key),title,narration,lineA,cn])}));
}
module.exports={addExtraThemes};
