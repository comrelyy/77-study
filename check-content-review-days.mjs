import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Element,documentModel} from './tests/fake-dom.mjs';
const require=createRequire(import.meta.url),catalog=require('./static/content/catalog.json');
globalThis.document=documentModel();
const {renderDay,renderPack}=await import('./static/dev/content-review.mjs');
const load=id=>require('./static/'+catalog.scenes[id]);
const catalogTwo={...catalog,days:[catalog.days[0],{id:'zoo-day',title:'和 Momo 逛动物园',approved:false,route:[{id:'dressing',band:0,icon:'shirt'},{id:'washing',band:0,icon:'toothbrush'}]}],
  scenes:catalog.scenes};
const snapshot={dayId:'zoo-day',title:'和 Momo 逛动物园',approved:false,levels:[],pictures:{kite:{status:'pending',path:'illustrations/kite.svg'},drum:{status:'approved',path:'illustrations/drum.svg'}}};
const draw=(day,snap)=>{const root=new Element('section');renderDay(root,day,id=>load(id),snap);return root;};
test('importing the module without a page does nothing',()=>{assert.equal(typeof renderDay,'function');assert.equal(typeof renderPack,'function');});
test('an unapproved day shows its state, commands, new pictures and its levels',()=>{
  const root=draw(catalogTwo.days[1],snapshot),text=root.textContent;
  assert.equal(root.querySelectorAll('.review-day').length,1);
  assert(text.includes('和 Momo 逛动物园'));assert(text.includes('未批准'));
  assert(text.includes('python -m momo_agent day-picture-approve zoo-day <词>'));assert(text.includes('python -m momo_agent day-approve zoo-day'));
  const grid=root.querySelectorAll('.review-newpic');assert.equal(grid.length,2);
  assert(grid[0].textContent.includes('kite')&&grid[0].textContent.includes('待审'));assert(grid[1].textContent.includes('已通过'));
  assert.equal(grid[0].querySelector('img').src,'../illustrations/kite.svg');
  assert.deepEqual(root.querySelectorAll('.review-theme').map(s=>s.id),['dressing','washing']);
});
test('a day without a snapshot lists no new pictures; an approved day says so',()=>{
  const none=draw(catalogTwo.days[1],null);assert.equal(none.querySelectorAll('.review-newpic').length,0);assert.equal(none.querySelectorAll('.review-theme').length,2);
  const ok=draw(catalogTwo.days[0],null);assert(ok.textContent.includes('已批准'));assert.equal(ok.querySelectorAll('.review-theme').length,13);
});
