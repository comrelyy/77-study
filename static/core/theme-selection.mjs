import {node,button,image} from './dom.mjs';

export function renderThemeSelection(root,scenes,enterScene){
  root.replaceChildren();
  const intro=node('section',undefined,'theme-intro');
  intro.append(node('div','MOMO’S LITTLE DISCOVERIES','eyebrow'),node('h1','今天想去哪里？'),node('p','选一个喜欢的主题，和 Momo 一起发现生活里的小惊喜。'));
  const choices=node('section',undefined,'theme-choices theme-selection');choices.setAttribute('aria-label','选择主题');
  for(const scene of scenes){
    const card=button('',()=>enterScene(scene.id),'theme-choice');
    card.append(image(scene.image,'','theme-thumb'),node('h2',scene.title),node('p',scene.description),node('span','进入主题 →','theme-enter'));
    choices.append(card);
  }
  root.append(intro,choices);
  if(!scenes.length)root.append(node('p','新的主题还在准备中，稍后再来看看。','notice'));
}
