import {node,button,image,actions,pages} from '../core/dom.mjs';
import {reviewCandidates,hearReview} from '../core/review-sources.mjs';
export function renderSummary(c,s){
  const review=reviewCandidates(c.app);
  const sheets=pages(c.pack.modules.summary),wrap=node('section',undefined,'center');s.page=Math.min(s.page||0,sheets.length-1);wrap.append(node('div','OUR WORDS · '+(s.page+1)+' / '+sheets.length,'eyebrow'),node('h1','今天的小伙伴'),node('p','点图卡再听一遍，不要求点完所有词。'));
  const grid=node('div',undefined,'word-grid');for(const id of sheets[s.page]){const w=c.word(id),b=button('',()=>c.hearWord(w),'word-card');b.append(c.assetImage(w.image),node('b',w.text+' ♫'),node('small',w.cn));grid.append(b);}wrap.append(grid,c.messageNode);
  if(review.length&&!s.reviewSkipped){
    const aside=node('section',undefined,'notice');aside.append(node('h2','再听听老朋友'),node('p','这是以前参与过的词。想听就点一下，也可以直接跳过。'));
    for(const candidate of review){const {word,pack}=candidate,b=button('',()=>hearReview(c.app,candidate),'word-card');b.append(image(pack.assets.find(a=>a.id===word.image).path,word.cn||word.text),node('b',word.text+' ♫'),node('small','来自：'+pack.title));aside.append(b);}
    aside.append(button('这次先跳过',()=>{s.reviewSkipped=true;c.redraw();}));wrap.append(aside);
  }
  const controls=actions(button('听听怎么玩',()=>c.guide('summary')),button('看看其他玩法',()=>c.app.home()));if(sheets.length>1)controls.prepend(button('上一页',()=>{if(s.page){s.page--;c.redraw();c.app.checkpoint('summary');}}),button('下一页',()=>{if(s.page+1<sheets.length){s.page++;c.redraw();c.app.checkpoint('summary');}}));wrap.append(controls);c.body.append(wrap);
}
