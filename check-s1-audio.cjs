const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function inspectWav(buffer){
  if(buffer.length<44||buffer.toString('ascii',0,4)!=='RIFF'||buffer.toString('ascii',8,12)!=='WAVE')throw Error('not a WAV file');
  if(buffer.readUInt32LE(4)+8!==buffer.length)throw Error('truncated or trailing WAV');
  let format,data;
  for(let offset=12;offset+8<=buffer.length;){const kind=buffer.toString('ascii',offset,offset+4),length=buffer.readUInt32LE(offset+4),start=offset+8;if(start+length>buffer.length)throw Error('truncated WAV chunk');if(kind==='fmt '){if(length<16)throw Error('invalid format chunk');format={codec:buffer.readUInt16LE(start),channels:buffer.readUInt16LE(start+2),rate:buffer.readUInt32LE(start+4),byteRate:buffer.readUInt32LE(start+8),bits:buffer.readUInt16LE(start+14)};}if(kind==='data')data=buffer.subarray(start,start+length);offset=start+length+(length%2);}
  if(!format||format.codec!==1||![8,16].includes(format.bits)||![1,2].includes(format.channels)||!format.rate||format.byteRate!==format.rate*format.channels*format.bits/8||!data?.length)throw Error('invalid PCM format/data');
  if(data.every(x=>x===0)||(format.bits===8&&data.every(x=>x===128)))throw Error('silent placeholder');
  const duration=data.length/format.byteRate;if(duration<.1||duration>30)throw Error('unexpected duration');
  return {...format,duration};
}
function requiredAssets(pack){return require('./static/dev/review-core.js').requiredIds(pack).map(id=>pack.assets.find(a=>a.id===id));}
function check(){
  const root=path.join(__dirname,'static'),pack=require('./static/dev/content/picnic.json'),errors=[],results=[];
  let manifest;try{manifest=JSON.parse(fs.readFileSync(path.join(root,'audio/s1-sample-manifest.json'),'utf8'));}catch{errors.push('sample manifest missing');}
  for(const asset of requiredAssets(pack)){
    try{const buffer=fs.readFileSync(path.join(root,asset.path)),info=inspectWav(buffer),sha256=crypto.createHash('sha256').update(buffer).digest('hex');const entry=manifest?.entries?.find(e=>e.id===asset.id);if(!entry||entry.path!==asset.path||entry.text!==asset.text||entry.language!==asset.language||entry.role!==asset.role||entry.sha256!==sha256)throw Error('manifest/text/hash mismatch');results.push({id:asset.id,sha256,...info});}catch(error){errors.push(asset.id+': '+error.message);}
  }
  return {status:errors.length?'failed':'passed',technicalOnly:true,results,errors,listeningReview:'pending',rightsReview:'pending'};
}
if(require.main===module){const result=check();fs.mkdirSync(path.join(__dirname,'reports'),{recursive:true});fs.writeFileSync(path.join(__dirname,'reports/s1-audio-technical.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));process.exitCode=result.status==='passed'?0:1;}
module.exports={inspectWav,requiredAssets,check};
