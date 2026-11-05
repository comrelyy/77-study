// Code-native SVG props follow the established 120x120 pencil/watercolour system.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'static/illustrations');
const art={
 shirt:'<path fill="#9eb6ad" d="m41 22-25 16 13 23 13-7-2 50 43-1-2-50 13 7 12-23-26-15q-18 17-39 0z"/><path d="M45 25q14 22 31-1m-33 69 35 1"/>',
 socks:'<path fill="#e4bcaa" d="m25 18 25 1-3 49 13 15q7 15-10 20l-27-23z"/><path fill="#b3c9cf" d="m71 17 24 3-3 48 14 15q6 15-9 19L70 79z"/><path d="m25 31 23 1m23-1 22 1"/>',
 'sock-single':'<path fill="#e4bcaa" d="m45 18 25 1-3 49 13 15q7 15-10 20l-27-23z"/><path d="m45 31 23 1"/>',
 shoes:'<path fill="#cda179" d="m16 43 24-2 11 20 8 12-2 21-43-1-3-18z"/><path fill="#9eb6ad" d="m73 42 22 1 9 21 7 10-2 20-43-1-2-18z"/><path d="m14 84 43 1m10-1 41 1m-87-31 21 5m-23 6 25 5m34-17 20 7m-22 4 25 6"/>',
 hat:'<path fill="#edcf77" d="M29 73q1-49 32-48 32 0 31 49z"/><path fill="#9fae79" d="m29 60 63 1-1 16-62-2z"/><path fill="#edcf77" d="M13 77q47-18 96 1l-7 16q-44 11-85-1z"/>',
 soap:'<ellipse cx="60" cy="91" rx="45" ry="14" fill="#d7dfc9"/><path fill="#e4bcaa" d="M24 55q0-13 16-14l43 1q16 1 15 15l-3 25q-33 14-68-1z"/><ellipse cx="61" cy="54" rx="32" ry="9" fill="#f5dfbc"/><circle cx="35" cy="25" r="8" fill="#fffaf0"/><circle cx="72" cy="18" r="11" fill="#fffaf0"/><circle cx="91" cy="32" r="6" fill="#fffaf0"/>',
 towel:'<path d="m14 27 92 1" stroke-width="5"/><path fill="#b3c9cf" d="m30 23 57 1-3 80-57-2z"/><path fill="#9eb6ad" d="m29 81 56 1-1 12-56-2z"/><path d="m40 37-2 36m12-37-1 38m12-38-1 38m12-38-1 38" stroke="#fffaf0"/>',
 toothbrush:'<path fill="#9eb6ad" d="M45 47h14l7 53q-8 15-17 0z"/><path fill="#f5dfbc" d="m42 20 25-2 3 33-28 1z"/><path d="m48 22 1 24m7-24 1 23m7-23 1 22" stroke="#fffaf0" stroke-width="4"/>',
 egg:'<path fill="#fff5dc" d="M60 14C42 14 24 51 25 75c1 36 70 37 71-1 1-25-20-61-36-60z"/><path d="M41 44q-10 20-4 34" stroke="#e7d1ad" stroke-width="4"/>',
 cup:'<path fill="#b3c9cf" d="m25 29 57 1-4 60q-22 14-48-1z"/><path d="M82 41q35-10 22 25-7 12-23 8" stroke-width="7"/><path d="m31 39 44 1m-40 44 36 1" stroke="#fffaf0" stroke-width="3"/>',
 tree:'<path fill="#cda179" d="m53 57 20-1 3 51-27-1z"/><path fill="#9fae79" d="M27 70C-1 59 16 29 34 31 26 1 73-1 79 25c31-10 45 28 18 39-17 21-47 16-70 6z"/><path d="m61 98 2-39m0 17-13-13m13 20 15-16"/>',
 flower:'<path d="m60 60-1 47" stroke="#71856b" stroke-width="5"/><path fill="#9fae79" d="M58 94q-31-2-29-21 26-2 29 21zm4-10q3-25 28-26 2 22-28 26z"/><path fill="#e4bcaa" d="M49 33C30 6 9 34 32 49 5 65 33 88 49 66c12 30 42 9 27-12 30-6 14-38-7-24 2-29-31-27-20 3z"/><circle cx="56" cy="48" r="14" fill="#edcf77"/>',
 bird:'<path fill="#b3c9cf" d="M23 59q13-36 51-20 14 7 15 25l19 13-25 4q-33 34-57 0L11 76z"/><path fill="#9eb6ad" d="M38 62q24-10 31 3-12 20-31-3z"/><circle cx="76" cy="53" r="3" fill="#574b40"/><path fill="#edcf77" d="m86 57 18 5-16 8z"/><path d="m46 95-3 14m19-15 2 14"/>',
 bag:'<path fill="#d9b477" d="m24 41 73 1 5 62-82-1z"/><path d="M40 47V27q18-25 39 0v20" stroke-width="5"/><path d="m32 56 2 35m56-34-1 36" stroke="#f5dfbc" stroke-width="4"/>',
 coin:'<circle cx="60" cy="60" r="42" fill="#edcf77"/><circle cx="60" cy="60" r="32" stroke="#aa8151"/><path d="m60 40-7 7 7-2v36m-10 0h21" stroke-width="4"/>',
 book:'<path fill="#9eb6ad" d="m21 25 71-7 9 77-71 10-10-14z"/><path fill="#fff5dc" d="m30 94 70-9 1 10-71 10q-13-4-10-14z"/><path d="m32 26 8 57m11-45 25-3m-24 14 28-3"/><path fill="#edcf77" d="m76 21 3 25 6-6 5 5-3-25z"/>',
 bed:'<path fill="#e4bcaa" d="m18 48 81 1 8 38-88-1z"/><path fill="#fff5dc" d="m22 36 29 1 4 22-33-1z"/><path fill="#9eb6ad" d="m52 49 46 1 8 36-52-1z"/><path d="m13 28 2 76m94-45-1 45M15 89l93 1" stroke-width="6"/>',
 lamp:'<path fill="#edcf77" d="m41 19 39 1 20 46-78-1z"/><path d="m60 67 1 30" stroke-width="6"/><ellipse cx="61" cy="100" rx="28" ry="7" fill="#cda179"/><path d="m81 67 1 14"/><circle cx="82" cy="84" r="3" fill="#cda179"/>',
 teddy:'<circle cx="34" cy="25" r="14" fill="#cda179"/><circle cx="86" cy="25" r="14" fill="#cda179"/><ellipse cx="60" cy="78" rx="28" ry="29" fill="#cda179"/><circle cx="60" cy="42" r="29" fill="#cda179"/><ellipse cx="60" cy="51" rx="16" ry="11" fill="#f5dfbc"/><path d="m43 38 4 5m0-5-4 5m30-5 4 5m0-5-4 5"/><path d="m56 49 8 0-4 5z" fill="#574b40"/><ellipse cx="26" cy="76" rx="13" ry="21" fill="#cda179"/><ellipse cx="94" cy="76" rx="13" ry="21" fill="#cda179"/><ellipse cx="39" cy="102" rx="17" ry="11" fill="#cda179"/><ellipse cx="80" cy="102" rx="17" ry="11" fill="#cda179"/><circle cx="60" cy="81" r="3" fill="#574b40"/><path d="m52 65 16 1-8 8z" fill="#e4bcaa"/>'
};
Object.assign(art,{
 bowl:'<ellipse cx="60" cy="40" rx="45" ry="14" fill="#fff5dc"/><path fill="#9eb6ad" d="M15 40q5 62 45 62 39 0 45-62-45 22-90 0z"/><path d="m30 64q30 12 59-1"/>',
 spoon:'<ellipse cx="63" cy="29" rx="20" ry="23" fill="#b3c9cf"/><path fill="#cda179" d="m57 50 11 1 1 51q-7 12-13 0z"/>',
 tomato:'<path fill="#d98772" d="M59 35C24 11 3 60 24 90q34 29 69-1 22-43-14-55z"/><path fill="#9fae79" d="m60 40-18-18 16 4 4-14 8 13 18-4-15 21-6-10z"/><path d="m35 52q-11 18-1 30" stroke="#fff5dc"/>',
 bus:'<path fill="#dfb774" d="M13 21h93v76H13z"/><path fill="#b3c9cf" d="m22 32 72 1v34H22z"/><path d="M45 33v34m24-34v34m19-34v49m-65-4h45"/><circle cx="33" cy="96" r="11" fill="#75604c"/><circle cx="86" cy="96" r="11" fill="#75604c"/>',
 ticket:'<path fill="#e4bcaa" d="M15 31h91v18q-16 9 0 18v21H15V67q16-9 0-18z"/><path d="m76 34 0 49" stroke-dasharray="4 4"/><path d="m28 46h32m-31 13h25m-25 13h33"/>',
 seat:'<path fill="#9eb6ad" d="M25 18h56v53H25z"/><path fill="#b3c9cf" d="m22 70 72-1 0 20-72 1z"/><path d="M31 91v17m53-17v17" stroke-width="7"/>',
 sun:'<circle cx="60" cy="60" r="28" fill="#edcf77"/><path d="M60 7v14m0 78v14M7 60h14m78 0h14M22 22l10 10m56 56 10 10M22 98l10-10m56-56 10-10" stroke="#be9e50" stroke-width="5"/>',
 rain:'<path fill="#b3c9cf" d="M24 64C2 59 12 29 33 35 40 9 73 9 82 34c31-2 35 28 12 31z"/><path d="m32 78-8 17m38-17-8 17m38-17-8 17m-34-1-7 15m35-14-7 15" stroke="#7195a6" stroke-width="4"/>',
 umbrella:'<path fill="#9eb6ad" d="M12 58Q61-24 108 58q-13-13-24 0-13-13-25 0-12-13-24 0-11-13-23 0z"/><path d="M59 58v36q0 25 20 7m-20-43q-1-37 1-47m-1 1Q37 25 35 58m25-46q22 12 24 46"/>',
 pot:'<path fill="#cda179" d="m23 40 73 1-11 64H35z"/><path fill="#e4bcaa" d="M18 27h84v19H18z"/><ellipse cx="60" cy="27" rx="41" ry="9" fill="#8b7965"/>',
 seed:'<path fill="#cda179" d="M31 91Q9 46 85 19q22 66-24 80-17 3-30-8z"/><path d="M38 85q15-36 42-57" stroke="#aa8151" stroke-width="4"/>'
});
for(const [name,body]of Object.entries(art))fs.writeFileSync(path.join(root,name+'.svg'),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none"><g stroke="#75604c" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`);

const backgrounds={
 dressing:'<path fill="#eee5d3" d="M35 28h173v227H35z"/><path d="M121 30v224m-71-55h145"/><circle cx="106" cy="133" r="4"/><path fill="#cda179" d="M414 162h108v18H414z"/><path d="m425 179-5 76m91-76 5 76"/>',
 washing:'<path fill="#b3c9cf" d="M90 24h150v118H90z"/><path fill="#fffaf0" d="M60 157h223l-23 56H82z"/><path d="M163 156v-39q0-26 27-25v20m-30 10h40M95 215v43m149-43v43m155-156h119"/><path fill="#b3c9cf" d="m432 98 55 1-3 103-55-2z"/>',
 breakfast:'<path fill="#e9dfc5" d="M100 157h412l-8 30H105z"/><path d="m129 186-8 74m363-74 10 74" stroke-width="8"/><ellipse cx="290" cy="157" rx="53" ry="12" fill="#fffaf0"/><path fill="#b3c9cf" d="M57 25h117v88H57z"/><path d="M115 26v85m-57-43h115"/>',
 tidy:'<path fill="#cda179" d="M54 132h160v100H54z"/><path d="M44 132h180m169-15h147m-135-5v137m123-137v137m-123-62h123" stroke-width="6"/><path fill="#fff5dc" d="M77 147h114v22H77z"/>',
 picnic:'<path fill="#cbd8b8" d="M0 163q150-65 300-5t300-3v125H0z"/><path fill="#e4bcaa" d="m142 169 273 2 44 83-345-1z"/><path d="m161 190 261 2m-276 28h292m-230-46-12 76m99-76 1 77m80-77 20 79" stroke="#fff5dc"/>',
 park:'<path fill="#cbd8b8" d="M0 170q200-75 350 0t250-11v121H0z"/><path fill="#e9dfc5" d="M70 280q195-118 471-96l59 38q-293-52-405 58z"/><path d="m73 102-1 105" stroke="#cda179" stroke-width="20"/><path fill="#9fae79" d="M25 112Q-3 39 65 35q74-21 69 54-8 54-109 23z"/>',
 shopping:'<path fill="#e9dfc5" d="M36 54h237v175H36z"/><path d="M37 115h235M37 173h235m-217 57V55m197 0v176" stroke-width="7"/><path fill="#9eb6ad" d="M372 158h182v90H372z"/><path d="M365 158h197" stroke-width="7"/><path fill="#e4bcaa" d="M32 25h246v31H32z"/>',
 bedtime:'<path fill="#b3c9cf" d="M40 26h115v101H40z"/><path d="M97 27v97m-55-47h111"/><path fill="#edcf77" d="M122 46q-20 23-38 0 1 34 31 20z"/><path fill="#9eb6ad" d="M282 169h260v65H282z"/><path fill="#fff5dc" d="M299 145h72v39h-72z"/><path d="M278 139v118m264-98v97m-263-17h263" stroke-width="7"/>'
};
Object.assign(backgrounds,{
 cooking:'<path fill="#e9dfc5" d="M73 170h454v25H73z"/><path d="m98 195-5 64m406-64 7 64" stroke-width="7"/><path fill="#b3c9cf" d="M44 29h126v81H44z"/><path d="M108 30v79M45 70h123"/>',
 transport:'<path fill="#e9dfc5" d="M3 214h594v63H3z"/><path d="M91 49v174" stroke-width="8"/><path fill="#b3c9cf" d="M58 24h66v67H58z"/><path d="M273 190h186m-174 0v40m160-40v40" stroke-width="7"/><path d="M12 259h575" stroke="#fffaf0" stroke-dasharray="35 20" stroke-width="8"/>',
 weather:'<path fill="#b3c9cf" d="M75 24h450v164H75z"/><path d="M300 25v162M75 106h450" stroke-width="5"/><path fill="#cda179" d="M55 187h490v14H55z"/><path d="M65 259h470"/>',
 gardening:'<path fill="#cbd8b8" d="M0 179q140-57 315-6t285-4v111H0z"/><path fill="#cda179" d="M64 171h169v18H64z"/><path d="M76 189v64m146-64v64m-167-63h169" stroke-width="6"/>'
});
function embed(name,x,y,size){
  const svg=fs.readFileSync(path.join(root,name+'.svg'),'utf8');
  const viewBox=svg.match(/viewBox="([^"]+)"/)[1],body=svg.replace(/^[\s\S]*?<svg\b[^>]*>/,'').replace(/<\/svg>\s*$/,'');
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${viewBox}" fill="none">${body}</svg>`;
}
// Each page has a storyboard, rather than a generic object floating between faces.
// Props are placed on the furniture/ground they refer to; foreground actions show
// rolling, sharing, swapping, rinsing and putting away without covering the text.
function storyboard(id,index,cast=['momo','bunny']){
  const i=index,props=[],marks=[];let characters=[['momo',215,130,125],['bunny',330,127,125]];
  const add=(...p)=>props.push(p),line=d=>marks.push(`<path d="${d}"/>`);
  if(id==='dressing'){
    marks.push('<path fill="#b3c9cf" d="M247 30h107v71H247z"/><path d="M298 30v70m-50-35h106m-4-14q24-16 42-1m-38 19q23-12 36-1"/>');
    if(i===0)add('shirt',276,158,73);
    if(i===1){add('sock-single',454,190,66);add('sock-single',283,202,57);line('m438 198 10-5m-12 16 13-1');}
    if(i===2){add('shoes',253,211,79);marks.push('<path d="M265 216q35-30 57-2m-9-10 9 10-12 2" stroke-dasharray="4 4"/>');}
    if(i===3)add('hat',238,129,57);
    if(i===4){add('shirt',231,195,49);add('socks',276,216,39);add('shoes',242,231,55);add('hat',239,129,57);}
  }else if(id==='washing'){
    characters=[['momo',125,142,121],['bunny',303,135,122]];
    if(i===0){add('water',165,120,45);line('m185 114 0 30m11-29 2 29');}
    if(i===1){add('soap',205,143,61);for(const [x,y,r]of [[209,151,7],[231,132,10],[256,146,6]])marks.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="#fffaf0"/>`);}
    if(i===2){line('m185 114v43m10-41 4 41');marks.push('<path d="m120 170 12 12 16-12m10 3 12 14 17-15" stroke="#b3c9cf"/>');}
    if(i===3){add('towel',248,178,70);line('m240 200 8 5m78-6 9-5');}
    if(i===4)add('toothbrush',260,118,68);
  }else if(id==='breakfast'){
    if(i===0)add('cup',260,99,68);
    if(i===1){add('bread',239,102,61);add('bread',347,104,58);line('m292 118q25-13 46 0m-8-8 8 8-10 2');}
    if(i===2){add('cup',289,107,59);props.push(['milk',246,70,70,-24]);marks.push('<path d="m291 114 16 14" stroke="#fffaf0" stroke-width="5"/>');}
    if(i===3){add('egg',275,110,53);marks.push('<path d="m288 98q-5-9 1-16m15 15q-5-9 1-16" stroke-dasharray="3 4"/>');}
    if(i===4){add('cup',315,185,61);line('m316 175 24 0m-6-6 6 6-6 6');}
  }else if(id==='tidy'){
    if(i===0){add('ball',91,150,62);add('car',295,214,61);add('teddy',482,202,64);line('m173 202-22-10m10-3-10 3 4 9');}
    if(i===1){add('ball',84,151,58);add('car',139,160,57);add('teddy',482,202,64);}
    if(i===2){add('ball',84,151,58);add('car',139,160,57);add('teddy',447,124,66);}
  }else if(id==='picnic'){
    marks.push(embed('tree',5,9,166));
    if(i===0){add('basket',148,179,73);add('apple',263,211,55);line('m231 223 18 2m-16 10 13 0');}
    if(i===1){add('basket',148,179,73);add('apple',305,206,49);add('banana',353,201,57);}
    if(i===2){add('basket',148,179,73);add('bread',258,208,52);add('bread',358,208,52);line('m312 219q15-9 33 0m-8-7 8 7-9 1');}
    if(i===3){add('basket',148,179,73);add('milk',321,193,69);add('apple',260,223,37);add('banana',367,224,39);}
  }else if(id==='park'){
    if(i===0)characters=[['momo',76,157,118],['bunny',200,151,122]];
    if(i===1){add('flower',474,179,73);characters=[['momo',264,142,124],['bunny',365,136,125]];}
    if(i===2){add('bird',87,48,66);line('m173 63 7-15 9 2m-11 13 0-13m21 16 4-12');characters=[['momo',97,150,121],['bunny',224,146,124]];}
    if(i===3){add('ball',287,217,61);line('m264 246h-22m114-2h23');}
    if(i===4){add('ball',487,189,55);line('m459 214 15-4m-18 16 16-3');characters=[['momo',180,137,125],['bunny',292,134,125]];}
  }else if(id==='shopping'){
    for(const [name,x,y]of [['apple',72,73],['apple',122,75],['banana',177,75],['banana',92,129]])add(name,x,y,49);
    if(i===0)add('bag',281,196,68);
    if(i===1)add('apple',286,165,61);
    if(i===2){add('apple',278,204,43);add('banana',290,165,61);}
    if(i===3){add('coin',451,124,42);add('bag',287,198,65);}
    if(i===4){add('bag',277,190,76);add('apple',288,180,37);add('banana',311,177,39);}
  }else if(id==='bedtime'){
    marks.push('<path fill="#cda179" d="M177 201h76v13h-76z"/><path d="M185 214v43m60-43v43m-214-93h113" stroke-width="4"/>');
    add('lamp',186,137,61);
    if(i===0){add('book',277,173,67);characters=[['momo',210,129,123],['bunny',335,125,126]];}
    if(i===1){marks.push('<path fill="#e4bcaa" d="M458 153q30-12 55 1v38h-55z"/>');add('teddy',473,171,55);}
    if(i===2){add('teddy',443,168,58);line('m349 174 24 0m-6-6 6 6-6 6');}
    if(i===3){add('book',60,113,49);add('teddy',443,168,58);marks.push('<path d="m204 129 4-12m16 14 10-8" stroke="#d9b477" stroke-dasharray="3 5"/>');}
    if(i===4){add('book',60,113,49);add('teddy',438,173,56);characters=[['bunny',182,135,123],['momo',323,119,115]];}
  }else if(id==='cooking'){
    const table=[['bowl',270,111,88],['tomato',295,108,65],['spoon',329,105,68],['bread',263,113,70],['spoon',300,105,78],['bowl',270,111,88]];
    add(...table[i%6]);if([1,2,4,5].includes(i))add('bowl',258,121,77);
    if(i===3){add('bread',350,119,56);add('bread',183,117,56);}
    if(i===4)line('m313 101q26-14 39 3m-10-12 10 12-13 0');
  }else if(id==='transport'){
    if(i===0)add('bus',409,44,141);
    if(i===1){add('bag',265,196,78);add('ticket',282,176,57);}
    if(i===2){add('bus',407,42,143);add('bag',282,208,64);}
    if(i===3){add('seat',246,171,97);add('seat',354,171,97);}
    if(i===4){add('bag',332,217,57);line('m278 226 32-1m-9-6 9 6-8 6');}
    if(i===5){add('bus',410,42,143);add('bag',275,208,62);add('ticket',311,182,46);}
  }else if(id==='weather'){
    if(i===0)add('sun',120,34,82);
    if(i===1){add('sun',120,34,82);add('cloud',351,58,109);}
    if(i===2)add('rain',265,44,119);
    if(i===3){add('rain',255,38,108);add('umbrella',445,171,93);}
    if(i===4){add('rain',260,38,108);add('book',277,192,63);}
    if(i===5){add('sun',132,38,86);add('cloud',364,45,86);}
  }else if(id==='gardening'){
    add('pot',264,178,86);
    if(i===1)add('seed',282,158,35);
    if(i===2){add('water',331,145,53);line('m336 183-19 20');}
    if(i===3)line('m365 156 18-10m-9-9 9 9-1-12');
    if(i===4||i===5)add('flower',269,121,75);
  }
  // Existing themes gained an ending, and tidying now shows the full cooperation.
  if(i===4&&id==='dressing')add('shirt',350,193,49);
  if(i===5&&id==='dressing'){add('shirt',231,196,48);add('shoes',243,232,52);add('hat',239,129,57);}
  if(i===4&&id==='washing')add('toothbrush',295,120,60);
  if(id==='tidy'&&i>=3){add('ball',84,151,58);add('car',139,160,57);add('teddy',447,124,66);if(i===5)add('ball',291,216,53);}
  if(i===5&&id==='washing'){add('soap',213,143,54);add('toothbrush',257,119,61);}
  if(i===5&&id==='breakfast'){add('cup',315,185,61);add('bread',263,108,54);}
  if(i===4&&id==='breakfast')add('bread',278,109,54);
  if(i===4&&id==='picnic')add('apple',293,214,51);
  if(i===5&&id==='picnic'){add('basket',280,180,82);add('bread',293,175,47);}
  if(i===5&&id==='park'){add('bird',87,48,66);add('ball',284,216,56);}
  if(i===5&&id==='shopping'){add('bag',277,190,76);add('apple',288,180,37);add('banana',311,177,39);}
  if(i===5&&id==='bedtime'){add('book',60,113,49);add('teddy',438,173,56);}
  const details=props.map(([name,x,y,size,rotation])=>rotation?`<g transform="rotate(${rotation} ${x+size/2} ${y+size/2})">${embed(name,x,y,size)}</g>`:embed(name,x,y,size)).join('');
  return {characters:characters.map(([role,...p])=>embed(role==='momo'?cast[0]:cast[1],...p)).join(''),details,marks:marks.join('')};
}
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'static/content/catalog.json'),'utf8'));
const sceneDir=path.join(root,'scenes');fs.mkdirSync(sceneDir,{recursive:true});
for(const id of Object.keys(catalog.scenes)){
  const pack=JSON.parse(fs.readFileSync(path.join(__dirname,'static',catalog.scenes[id]),'utf8'));
  for(const [index,scene]of pack.modules.story.entries()){
    if(!scene.illustration)continue;
    const bg=backgrounds[id];if(!bg)throw Error('Missing scene art: '+id);
    const board=storyboard(id,index,scene.characters.map(c=>c.split('.').at(-1)));
    const background=id==='shopping'&&index===5?backgrounds.breakfast:bg;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 280" fill="none"><rect x="2" y="2" width="596" height="276" rx="24" fill="#fffaf0"/><g stroke="#8b7965" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${background}<path d="M16 261q278-9 565 0"/>${board.marks}${board.characters}${board.details}</g></svg>`;
    const a=pack.assets.find(a=>a.id===scene.illustration);fs.writeFileSync(path.join(__dirname,'static',a.path),svg);
  }
  const game=pack.modules.game;
  if(game.type==='scene-find'){
    const props=game.hotspots.map(h=>{const w=pack.words.find(w=>w.id===h.word),asset=pack.assets.find(a=>a.id===w.image),name=path.basename(asset.path,'.svg');return embed(name,h.x*600-45,h.y*360-45,90);}).join('');
    const gameBackground=id==='park'?'<path fill="#cbd8b8" d="M0 179q200-55 350 0t250-11v192H0z"/><path fill="#e9dfc5" d="M70 360q195-118 471-96l59 38q-293-52-405 58z"/>':id==='transport'?'<path fill="#e9dfc5" d="M3 214h594v63H3z"/><path d="M91 49v174" stroke-width="8"/><path fill="#b3c9cf" d="M58 24h66v67H58z"/><path d="M12 259h575" stroke="#fffaf0" stroke-dasharray="35 20" stroke-width="8"/>':backgrounds[id];
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360" fill="none"><rect width="600" height="360" rx="22" fill="#fffaf0"/><g stroke="#8b7965" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${gameBackground}<path d="M12 341h575"/>${props}</g></svg>`;
    fs.writeFileSync(path.join(__dirname,'static',pack.assets.find(a=>a.id===game.illustration).path),svg);
  }
}
console.log('Content props and self-contained story illustrations generated.');
