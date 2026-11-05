// Adapted from illustration-ink-sketch: seeded pressure-sensitive brush polygons.
import * as K from './ink-kit.mjs';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('../static/illustrations/',import.meta.url));
const brown={c:'#cfa47b',d:'#aa7959'},cream={c:'#fff8e9',d:'#dfc9aa'},sage={c:'#9cad95',d:'#71856b'},peach={c:'#e6b5a1',d:'#d39483'};
function blob(key,pts,col){
 const loop=K.fillShape(key,pts,col.c,{off:[-2,2],j:1.3});K.mottle(loop,col.d,.33);
 K.clipOpen(loop);const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
 K.stroke(key+'shade',[[cx+25,cy-18],[cx+32,cy],[cx+22,cy+25]],{w:12,t0:12,t1:16},col.d,.24);
 K.stroke(key+'shine',[[cx-23,cy-20],[cx-28,cy-8]],{w:4,t0:4,t1:6},'#ffffff',.8);K.clipClose();
 const dl=K.resample(K.catmull(pts,true,10),1);
 for(const [i,a,b] of [[0,.02,.30],[1,.32,.64],[2,.68,1.01]])K.stroke(key+'line'+i,K.loopSlice(dl,a,b),{...K.OUT([cx,cy]),t0:8,t1:9,dense:true});
 return loop;
}
function oval(key,x,y,rx,ry,col){return blob(key,K.arc(x,y,rx,ry,0,330,30),col);}
function line(key,pts,w=3){K.stroke(key,pts,{w,t0:3,t1:4,nib:.4,press:.4});}
for(const animal of ['momo','bunny']){
 K.reset();K.setPrefix(animal+'-');const bear=animal==='momo',fur=bear?brown:cream;
 // Brief: curious picnic companions. Momo's round ears + sage neckerchief;
 // bunny's asymmetric long ears + peach neckerchief. Open, reassuring smile.
 K.hatch('contact',K.arc(240,319,70,6,0,360,12),{ang:-55,sp:3,w:1,op:.5});
 oval('leftFoot',201,307,28,15,fur);oval('rightFoot',276,307,28,15,fur);
 oval('body',240,263,62,48,fur);oval('belly',239,273,35,30,cream);
 oval('leftArm',175,260,20,30,fur);oval('rightArm',304,244,19,31,fur);
 if(bear){oval('earL',174,119,31,32,fur);oval('earR',305,115,30,33,fur);oval('earInnerL',174,120,15,17,peach);oval('earInnerR',305,116,15,17,peach);}
 else{blob('earL',[[194,151],[165,92],[163,49],[178,35],[196,58],[214,140]],fur);blob('earR',[[250,138],[257,63],[274,28],[289,34],[291,68],[275,151]],fur);K.stroke('innerL',[[179,60],[184,88],[199,129]],{w:11,t0:10,t1:14},peach.c);K.stroke('innerR',[[278,49],[274,84],[264,124]],{w:10,t0:9,t1:14},peach.c);}
 oval('head',239,179,87,70,fur);
 if(bear)oval('muzzle',241,211,40,25,cream);
 K.eye('eyeL',[207,171],20,[212,175],9.5);K.eye('eyeR',[261,168],22,[266,172],10.5);
 K.blush('cheekL',180,207);K.blush('cheekR',296,202);
 blob('nose',[[234,201],[248,201],[241,209]],bear?brown:peach);
 line('philtrum',[[241,210],[241,217]],2.5);line('smile',[[225,218],[233,224],[243,225],[254,217]],2.8);
 blob('scarf',[[193,235],[237,247],[280,232],[263,258],[238,253],[212,263]],bear?sage:peach);
 line('scarfFold',[[238,248],[241,257],[253,264]],1.5);
 for(const [i,x,y] of [[0,191,291],[1,284,286],[2,170,183]])line('fur'+i,[[x,y],[x+4,y-5]],1.3);
 let svg=K.svgOut(dir+animal+'.svg',{label:bear?'Momo，戴鼠尾草绿领巾的好奇小熊':'小兔，戴桃色领巾的温柔伙伴'});
 // Keep the existing square image contract and warm project palette.
 svg=svg.replace('viewBox="0 0 480 360"','viewBox="60 0 360 360"').replaceAll('#1d1a18','#665442').replaceAll('#c9d6ea','#e3dacb').replaceAll('#ff7f86','#e6b5a1').replaceAll('#d9434f','#d39483').replaceAll('#c8303f','#d39483');
 fs.writeFileSync(dir+animal+'.svg',svg);
}

// New cast members have their own silhouettes, rather than recoloured bear bodies.
const rust={c:'#d49a70',d:'#ad7356'}, blue={c:'#b3c9cf',d:'#87a4ae'};
for(const animal of ['fox','turtle']){
 K.reset();K.setPrefix(animal+'-');const fox=animal==='fox';
 K.hatch('contact',K.arc(240,319,89,6,0,360,12),{ang:-55,sp:3,w:1,op:.5});
 if(fox){
  blob('tail',[[280,295],[319,271],[320,220],[344,190],[366,213],[370,251],[344,291],[303,310]],rust);
  blob('tailTip',[[320,220],[344,190],[366,213],[370,236],[350,226],[339,244]],cream);
  oval('leftFoot',201,307,25,14,rust);oval('rightFoot',268,307,25,14,rust);
  oval('body',235,264,55,45,rust);oval('belly',235,270,29,30,cream);
  oval('leftArm',176,259,17,28,rust);oval('rightArm',292,247,16,30,rust);
  blob('earL',[[162,153],[157,77],[179,88],[207,137]],rust);
  blob('earR',[[265,133],[297,77],[313,86],[310,158]],rust);
  blob('innerL',[[172,132],[168,97],[189,132]],peach);blob('innerR',[[281,132],[300,98],[299,140]],peach);
  blob('head',[[161,145],[191,126],[240,133],[282,126],[311,148],[321,182],[289,217],[239,242],[192,220],[151,181]],rust);
  blob('cheeks',[[160,181],[196,180],[239,203],[279,178],[314,181],[284,214],[239,237],[192,215]],cream);
  K.eye('eyeL',[204,166],19,[209,169],9);K.eye('eyeR',[265,164],21,[270,167],10);
  K.blush('blL',184,200);K.blush('blR',294,199);
  blob('nose',[[230,200],[247,201],[238,211]],brown);
  line('smile',[[225,218],[235,223],[246,220],[253,213]],2.8);
  blob('scarf',[[195,235],[236,245],[276,234],[264,255],[239,251],[216,263]],blue);
  line('fold',[[236,245],[240,254],[251,261]],1.5);
 }else{
  // A low, broad shell and four planted feet make the turtle distinct at thumbnail size.
  oval('farFootL',176,294,24,14,sage);oval('farFootR',301,294,24,14,sage);
  blob('tail',[[310,277],[337,289],[315,294]],sage);
  oval('shell',250,256,81,54,sage);
  oval('shellInset',251,254,63,40,{c:'#c4cfaa',d:'#9cad95'});
  line('shellTop',[[222,224],[243,241],[266,238],[283,221]],2.4);
  line('shellMid',[[243,241],[239,265],[264,279],[288,266],[286,243],[266,238]],2.4);
  line('shellLeft',[[239,265],[211,272],[198,254]],2.4);line('shellRight',[[288,266],[311,272]],2.4);
  oval('nearFootL',206,307,25,14,sage);oval('nearFootR',291,307,25,14,sage);
  oval('neck',205,230,34,37,sage);
  oval('head',205,172,70,59,sage);oval('chin',204,204,44,23,{c:'#dfe4c8',d:'#b4bf98'});
  K.eye('eyeL',[178,158],20,[183,161],9.5);K.eye('eyeR',[229,155],22,[234,158],10.5);
  K.blush('blL',158,189);K.blush('blR',253,187);
  line('nostrilL',[[198,188],[200,189]],2);line('nostrilR',[[211,188],[213,187]],2);
  line('smile',[[190,205],[202,212],[216,209],[222,203]],2.8);
  blob('scarf',[[176,225],[204,235],[235,223],[229,243],[207,241],[190,251]],{c:'#dfb774',d:'#be9e50'});
  line('fold',[[204,235],[209,243],[219,248]],1.5);
 }
 let svg=K.svgOut(dir+animal+'.svg',{label:fox?'Fifi 菲菲，戴雾蓝领巾的活泼小狐狸':'Toto 托托，戴麦黄领巾的耐心小乌龟'});
 svg=svg.replace('viewBox="0 0 480 360"','viewBox="60 0 360 360"').replaceAll('#1d1a18','#665442').replaceAll('#c9d6ea','#e3dacb').replaceAll('#ff7f86','#e6b5a1').replaceAll('#d9434f','#d39483').replaceAll('#c8303f','#d39483');
 fs.writeFileSync(dir+animal+'.svg',svg);
}

const template=fs.readFileSync(new URL('./picnic-template.svg',import.meta.url),'utf8');
const embed=(name,x,y,w,h)=>fs.readFileSync(dir+name+'.svg','utf8').replace('<svg ', '<svg x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" ');
fs.writeFileSync(new URL('../static/picnic-sketch.svg',import.meta.url),template.replace('{{CHARACTERS}}',embed('momo',44,83,222,258)+embed('bunny',249,140,157,198)));
