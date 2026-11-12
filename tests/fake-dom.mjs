// Minimal document model for unit tests, not a browser/visual verification tool.
// children is an HTMLCollection as in browsers: indexable and iterable, but no forEach/map/filter.
class HTMLCollection{
  constructor(kids){kids.forEach((k,i)=>{this[i]=k;});this.length=kids.length;}
  item(i){return this[i]??null;}
  *[Symbol.iterator](){for(let i=0;i<this.length;i++)yield this[i];}
}
export class Element{
  get children(){return new HTMLCollection(this.kids);}
  constructor(tag){this.tagName=tag;this.kids=[];this.attributes={};this.listeners={};this.style={};this.className='';this.disabled=false;this._text='';}
  set textContent(text){this._text=String(text);this.kids=[];}
  get textContent(){return this._text+this.kids.map(c=>c.textContent).join('');}
  append(...children){for(const c of children){c.parent=this;this.kids.push(c);}}
  prepend(...children){for(const c of children)c.parent=this;this.kids.unshift(...children);}
  replaceChildren(...children){for(const c of this.kids)c.parent=null;this.kids=[];this._text='';this.append(...children);}
  remove(){if(this.parent)this.parent.kids=this.parent.kids.filter(c=>c!==this);this.parent=null;}
  setAttribute(key,value){this.attributes[key]=String(value);}
  addEventListener(name,fn){(this.listeners[name]||=([])).push(fn);}
  async fire(name='click'){if(this.disabled)return;for(const fn of this.listeners[name]||[])await fn();}
  matches(selector){if(selector.startsWith('.'))return this.className.split(/\s+/).includes(selector.slice(1));if(selector.startsWith('#'))return this.id===selector.slice(1);return this.tagName===selector;}
  querySelectorAll(selector){return this.kids.flatMap(c=>[...(c.matches(selector)?[c]:[]),...c.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
export function documentModel(){return {createElement:tag=>new Element(tag)};}
