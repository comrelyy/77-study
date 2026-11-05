// Minimal document model for unit tests, not a browser/visual verification tool.
export class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.listeners={};this.style={};this.className='';this.disabled=false;this._text='';}
  set textContent(text){this._text=String(text);this.children=[];}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
  append(...children){for(const c of children){c.parent=this;this.children.push(c);}}
  prepend(...children){for(const c of children)c.parent=this;this.children.unshift(...children);}
  replaceChildren(...children){for(const c of this.children)c.parent=null;this.children=[];this._text='';this.append(...children);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}
  setAttribute(key,value){this.attributes[key]=String(value);}
  addEventListener(name,fn){(this.listeners[name]||=([])).push(fn);}
  async fire(name='click'){if(this.disabled)return;for(const fn of this.listeners[name]||[])await fn();}
  matches(selector){if(selector.startsWith('.'))return this.className.split(/\s+/).includes(selector.slice(1));if(selector.startsWith('#'))return this.id===selector.slice(1);return this.tagName===selector;}
  querySelectorAll(selector){return this.children.flatMap(c=>[...(c.matches(selector)?[c]:[]),...c.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
export function documentModel(){return {createElement:tag=>new Element(tag)};}
