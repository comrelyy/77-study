const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function inspectWav(bytes){
  if(bytes.length<44||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw Error('Invalid WAV header');
  if(bytes.readUInt32LE(4)+8!==bytes.length)throw Error('Truncated WAV file');
  let format,data;
  for(let offset=12;offset+8<=bytes.length;){
    const size=bytes.readUInt32LE(offset+4),start=offset+8,end=start+size;
    if(end>bytes.length)throw Error('Truncated WAV chunk');
    const id=bytes.toString('ascii',offset,offset+4);
    if(id==='fmt '){if(size<16)throw Error('Invalid audio format');format={codec:bytes.readUInt16LE(start),channels:bytes.readUInt16LE(start+2),rate:bytes.readUInt32LE(start+4),alignment:bytes.readUInt16LE(start+12),bits:bytes.readUInt16LE(start+14)};}
    if(id==='data')data=bytes.subarray(start,end);
    offset=end+(size%2);
  }
  if(!format||!data?.length||format.codec!==1||![8,16].includes(format.bits)||![1,2].includes(format.channels)||format.rate<8000||format.alignment!==format.channels*format.bits/8||data.length%format.alignment)throw Error('Invalid PCM samples');
  let peak=0;for(let i=0;i<data.length;i+=format.bits/8)peak=Math.max(peak,Math.abs(format.bits===16?data.readInt16LE(i):data[i]-128));
  if(!peak)throw Error('Silent audio');
  return {seconds:data.length/format.alignment/format.rate,...format};
}
function inspectPack(pack,staticRoot){
  return pack.assets.filter(a=>a.kind==='audio').map(asset=>{
    const result={id:asset.id,path:asset.path,text:asset.text,exists:false,valid:false};
    try{
      const root=path.resolve(staticRoot),file=path.resolve(root,asset.path);
      if(!file.startsWith(root+path.sep))throw Error('Audio path escapes static directory');
      const bytes=fs.readFileSync(file);result.exists=true;result.sha256=crypto.createHash('sha256').update(bytes).digest('hex');
      Object.assign(result,inspectWav(bytes),{valid:true});
    }catch(error){result.error=error.message;}
    return result;
  });
}
module.exports={inspectWav,inspectPack};
