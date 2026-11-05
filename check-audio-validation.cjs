const {test}=require('node:test'),assert=require('node:assert/strict');
const {inspectWav}=require('./audio-validation.cjs');
function wav(){const b=Buffer.alloc(48);b.write('RIFF');b.writeUInt32LE(40,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(4,40);b.writeInt16LE(500,44);return b;}
test('valid PCM is accepted; empty, truncated, silent and malformed files are rejected',()=>{
  assert(inspectWav(wav()).seconds>0);
  for(const bytes of [Buffer.alloc(0),Buffer.from('not audio'),wav().subarray(0,46)])assert.throws(()=>inspectWav(bytes));
  const silent=wav();silent.fill(0,44);assert.throws(()=>inspectWav(silent));
  const malformed=wav();malformed.writeUInt32LE(900,40);assert.throws(()=>inspectWav(malformed));
});
