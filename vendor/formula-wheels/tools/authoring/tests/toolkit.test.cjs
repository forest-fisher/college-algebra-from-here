// Copyright (c) 2026 Forest Fisher. MPL-2.0.
// Created with extensive ChatGPT (OpenAI) assistance.
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const {generate,render,main:generateMain}=require('../generate-values.cjs');
const {transform,parseSource}=require('../speech-core.cjs');
const {makeGenerator}=require('../speech-engine.cjs');
const root=path.resolve(__dirname,'..');
function temp(){return fs.mkdtempSync(path.join(os.tmpdir(),'fw-speech-'));}
function numbers(x){return x.rows.map(Number);}

test('default 0.1 exact grid, both endpoints inclusive; integers unaffected',()=>{
  const x=generate({start:'2',end:'6',seed:'42'});
  assert.equal(x.rows.length,41);
  assert.deepEqual(x.rows.slice(0,5),['2','2.1','2.2','2.3','2.4']);
  assert.equal(x.rows.at(-1),'6');
});
test('positive noise bounded, seeded, all integers anchored',()=>{
  const opts={start:'2',end:'6',noise:'0.04',anchors:'1',seed:'42'};
  const a=generate(opts),b=generate(opts);
  assert.deepEqual(a,b);
  for(let i=0;i<a.rows.length;i++){
    const v=Number(a.rows[i]),baseline=2+i/10;
    if(i%10===0)assert.equal(v,baseline);
    else assert.ok(v>=baseline-1e-9 && v<=baseline+0.04000001);
    if(i>0)assert.ok(v>Number(a.rows[i-1]));
  }
});
test('symmetric noise may move in both directions but preserves endpoints and order',()=>{
  const x=generate({start:'2',end:'6',noise:'0.04','noise-mode':'symmetric',anchors:'1',seed:'42'});
  const delta=x.rows.map((v,i)=>Number(v)-(2+i/10));
  assert.ok(delta.some(v=>v < -0.001));assert.ok(delta.some(v=>v>0.001));
  assert.ok(delta.every(v=>Math.abs(v)<0.04000001));
  assert.ok(x.rows.every((v,i)=>i===0||Number(v)>Number(x.rows[i-1])));
  assert.equal(x.rows[10],'3');assert.equal(x.rows[40],'6');
});
test('explicit anchors and negative values',()=>{
  const x=generate({start:'-1',end:'1',increment:'0.5',noise:'0.04',anchors:'1','anchor-values':'-0.5,0.5',seed:'abc'});
  assert.equal(x.rows[1],'-0.5');assert.equal(x.rows[3],'0.5');
  assert.equal(x.rows.at(-1),'1');
});
test('regular anchors are multiples of spacing relative to zero, not start',()=>{
  const base={start:'2',end:'22',increment:'0.1',noise:'0.04',anchors:'10',seed:'42'};
  const a=generate(base).rows;
  assert.equal(a[0],'2'); assert.equal(a[80],'10');
  assert.equal(a[180],'20');assert.equal(a.at(-1),'22');
  const random=generate({...base,anchors:undefined}).rows;
  assert.notDeepEqual(a,random);
  assert.ok(a.some((v,i)=>i!==0&&i!==80&&i!==180&&i!==200&&Number(v)!==2+i/10));
});
test('fractional spacing and explicit anchors combine on a cross-zero grid',()=>{
  const a=generate({start:'-3',end:'1',increment:'0.1',noise:'0.04',
    anchors:'0.5','anchor-values':'-2.7,-1.3,0.3',seed:'42'}).rows;
  for(let i=0;i<a.length;i++){
    const base=(-30+i)/10;
    if(i%5===0||[-2.7,-1.3,0.3].some(x=>Math.abs(x-base)<1e-8))
      assert.equal(Number(a[i]),base);
  }
});
test('positive noise increases magnitude of negatives; zero fixed; strictly ordered',()=>{
  const a=generate({start:'-3',end:'1',increment:'0.1',noise:'0.04',
    anchors:'1',seed:'42'}).rows;
  assert.equal(a.length,41);
  let sawNegativeShift=false, sawPositiveShift=false;
  for(let i=0;i<a.length;i++){
    const base=(-30+i)/10, value=Number(a[i]);
    if(base<0){assert.ok(value<=base+1e-9 && value>=base-0.04000001);
      if(value<base-0.001)sawNegativeShift=true;
    }else if(base>0){assert.ok(value>=base-1e-9 && value<=base+0.04000001);
      if(value>base+0.001)sawPositiveShift=true;
    }else assert.equal(value,0);
    if(i%10===0)assert.equal(value,base);
    if(i>0)assert.ok(value>Number(a[i-1]));
  }
  assert.ok(sawNegativeShift);assert.ok(sawPositiveShift);
});
test('symmetric noise on negative values can shift in either direction',()=>{
  const a=generate({start:'-3',end:'1',increment:'0.1',noise:'0.04',
    'noise-mode':'symmetric',seed:'42'}).rows;
  const shifts=a.map((v,i)=>Number(v)-(-30+i)/10);
  const negativeShifts=shifts.slice(1,30);
  assert.ok(negativeShifts.some(n=>n < -0.001));
  assert.ok(negativeShifts.some(n=>n > 0.001));
  assert.ok(a.every((v,i)=>i===0||Number(v)>Number(a[i-1])));
});
test('invalid anchor spacing and off-grid or out-of-range values fail',()=>{
  for(const anchors of ['0','-1','integers','1,0.5'])
    assert.throws(()=>generate({start:'2',end:'6',anchors}),/anchors/);
  for(const v of ['2.05','1.9','6.1','2.5,'])
    assert.throws(()=>generate({start:'2',end:'6','anchor-values':v}),/anchor-values|Anchor/);
});
test('anchor-values never insert numbers and can be used without regular anchors',()=>{
  const a=generate({start:'2',end:'3',noise:'0.04',
    'anchor-values':'2.5,2.7',seed:'10'}).rows;
  assert.equal(a.length,11);
  assert.equal(a[5],'2.5');assert.equal(a[7],'2.7');
});
test('bad increments, off-grid anchors and unsafe noise fail',()=>{
  assert.throws(()=>generate({start:'2',end:'6.05',increment:'0.1'}),/exactly/);
  assert.throws(()=>generate({start:'2',end:'6','anchor-values':'2.25'}),/Anchor/);
  assert.throws(()=>generate({start:'2',end:'6',increment:'0.1',noise:'0.06','noise-mode':'symmetric'}),/too large/);
  assert.throws(()=>generate({start:'2',end:'2000',increment:'0.1'}),/Too many/);
});
test('generated source parses and has exactly one fresh new-file output',()=>{
  const dir=temp(),out=path.join(dir,'generated.js');
  try{
    generateMain(['--start','2','--end','2.2','--output',out]);
    parseSource(fs.readFileSync(out,'utf8'));
    assert.throws(()=>generateMain(['--start','2','--end','2.2','--output',out]),/EEXIST/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('preserve existing speech, unrelated JavaScript bytes, literals and formatting',async()=>{
  const src=[
   'const c=0; // before',
   'const values=[',
   '  {',
   "    id: 'a',",
   '    latex: String.raw`\\sqrt{5}`,',
   '    value: Math.sqrt(5)',
   '  },',
   "  {id:'b', latex: String.raw`\\frac{3}{7}`, value:3/7, speech:'author words'},",
   "  { id:'c', latex:'2.3', value:2.3, },",
   '];',
   'const other = Math.sqrt(3);',
   ''
  ].join('\n');
  const generator=await makeGenerator('clearspeak');
  const result=await transform(src,generator);
  assert.equal(result.found,3);assert.equal(result.added,2);assert.equal(result.existing,1);
  assert.equal(result.issues.length,0);
  assert.ok(result.source.includes("speech: 'the square root of 5'"));
  assert.ok(result.source.includes("speech:'author words'"));
  assert.ok(result.source.includes("speech: '2.3'"));
  assert.ok(result.source.includes('const other = Math.sqrt(3);'));
  assert.ok(result.source.includes("    value: Math.sqrt(5),\n    speech: 'the square root of 5'"));
  parseSource(result.source);
  const second=await transform(result.source,generator);
  assert.equal(second.added,0);
  assert.equal(second.existing,3);
  assert.equal(second.source,result.source);
});
test('three real SRE modes generate differing descriptions',async()=>{
  const out=[];
  for(const domain of ['clearspeak','mathspeak','chromevox']){
    const generate=await makeGenerator(domain);
    out.push(generate('\\sqrt{5}'));
  }
  assert.equal(out.length,3);assert.equal(new Set(out).size,3);
  assert.match(out[0],/square root of 5/i);
  assert.match(out[1],/StartRoot/);
  assert.match(out[2],/Square root of five/);
});
test('dynamic latex and comments flagged, unknown TeX handled; skip but produce valid JS',async()=>{
  const src="const a=[{id:'x',latex: String(x), value:1},\n"+
      "{id:'y',latex:String.raw`\\sqrt{2}`,value:2 // comment\n},\n"+
      "{id:'z',latex:String.raw`\\notarealmacro{2}`,value:3}];\n";
  const result=await transform(src,await makeGenerator('clearspeak'));
  assert.equal(result.added,0);
  assert.equal(result.issues.length,3);
  assert.equal(result.source,src);
});
test('CLI emits a distinct file, refuses overwrite and supports all three modes',()=>{
  const dir=temp(),file=path.join(dir,'math.js');
  fs.writeFileSync(file,"const values = [{ id: 'a', latex: String.raw`\\sqrt{5}`, value: Math.sqrt(5) }];\n");
  try{
    let p=spawnSync(process.execPath,[path.join(root,'add-speech.cjs'),file,'--rules','mathspeak'],{encoding:'utf8'});
    assert.equal(p.status,0,p.stderr);
    const out=path.join(dir,'math.with-speech.js');
    assert.match(fs.readFileSync(out,'utf8'),/StartRoot/);
    p=spawnSync(process.execPath,[path.join(root,'add-speech.cjs'),file,'--rules','mathspeak'],{encoding:'utf8'});
    assert.equal(p.status,1);
    p=spawnSync(process.execPath,[path.join(root,'add-speech.cjs'),file,'--output',file],{encoding:'utf8'});
    assert.equal(p.status,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
