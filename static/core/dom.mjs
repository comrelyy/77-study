export function node(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
export function button(text,action,className){const e=node('button',text,className);e.type='button';e.addEventListener('click',action);return e;}
export function image(src,alt='',className='sketch-icon'){const e=node('img',undefined,className);e.src=/^(?:\.\.\/)?illustrations\/scenes\//.test(src)?src+'?v=content-v2':/^(?:illustrations\/(?:momo|bunny)\.svg|picnic-sketch\.svg)$/.test(src)?src+'?v=characters-20261029':src;e.alt=alt;e.draggable=false;return e;}
export function actions(...buttons){const e=node('div',undefined,'scene-controls');e.append(...buttons);return e;}
export function pages(items,size=4){const result=[];for(let i=0;i<items.length;i+=size)result.push(items.slice(i,i+size));return result;}
