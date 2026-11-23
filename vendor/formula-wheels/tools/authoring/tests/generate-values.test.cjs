// Copyright (c) 2026 Forest Fisher. MPL-2.0.
// Created with extensive ChatGPT (OpenAI) assistance.
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {generate,main}=require('../generate-values.cjs');

const opts={start:'-3',end:'1',increment:'0.1',noise:'0.04',anchors:'1',seed:'42'};

test('exact inclusive grid with default 0.1 increment',()=>{
  const a=generate({start:'2',end:'6',seed:'42'}).rows;
  assert.equal(a.length,41);
  assert.deepEqual(a.slice(0,5),['2','2.1','2.2','2.3','2.4']);
  assert.equal(a.at(-1),'6');
});
test('positive mode subtracts noise for negative numbers and adds for positive',()=>{
  const a=generate(opts).rows;
  assert.equal(a.length,41);
  let changedNegative=false,changedPositive=false;
  for(let i=0;i<a.length;i++){
    const base=(-30+i)/10,value=Number(a[i]);
    if(base<0){
      assert.ok(value<=base+1e-9 && value>=base-0.04000001);
      if(value<base-0.001)changedNegative=true;
    }else if(base>0){
      assert.ok(value>=base-1e-9 && value<=base+0.04000001);
      if(value>base+0.001)changedPositive=true;
    }else assert.equal(value,0);
    if(i%10===0)assert.equal(value,base);
    if(i)assert.ok(value>Number(a[i-1]));
  }
  assert.ok(changedNegative && changedPositive);
});
test('positive mode always protects zero, even without anchors',()=>{
  const a=generate({...opts,anchors:undefined}).rows;
  assert.equal(a[30],'0');
});
test('symmetric mode can perturb negative numbers in both directions',()=>{
  const a=generate({...opts,anchors:undefined,'noise-mode':'symmetric'}).rows;
  const differences=a.map((v,i)=>Number(v)-(-30+i)/10).slice(1,30);
  assert.ok(differences.some(v=>v<-0.001));
  assert.ok(differences.some(v=>v>0.001));
});
test('regular spacing is zero-relative, not start-relative',()=>{
  const a=generate({start:'2',end:'22',increment:'0.1',noise:'0.04',anchors:'10',seed:'42'}).rows;
  assert.equal(a.length,201);
  assert.equal(a[0],'2');
  assert.equal(a[80],'10');
  assert.equal(a[180],'20');
  assert.equal(a[200],'22');
  assert.notEqual(a[100],'12'); // start-relative 12 should not be automatically anchored
});
test('fractional regular anchors protect half-unit multiples',()=>{
  const a=generate({...opts,anchors:'0.5'}).rows;
  for(let i=0;i<a.length;i++){
    const base=(-30+i)/10;
    if(i%5===0)assert.equal(Number(a[i]),base);
  }
});
test('separate --anchor-values can protect chosen values alongside regular anchors',()=>{
  const a=generate({...opts,anchors:'1','anchor-values':'-2.7,-1.3,0.3'}).rows;
  assert.equal(a[3],'-2.7');
  assert.equal(a[17],'-1.3');
  assert.equal(a[33],'0.3');
  for(let i=0;i<a.length;i+=10)assert.equal(Number(a[i]),(-30+i)/10);
});
test('explicit anchor-values alone work without adding grid items',()=>{
  const a=generate({start:'2',end:'3',noise:'0.04',seed:'42','anchor-values':'2.5,2.7'}).rows;
  assert.equal(a.length,11);
  assert.equal(a[5],'2.5');
  assert.equal(a[7],'2.7');
});
test('seed is reproducible',()=>{
  const a=generate(opts);
  assert.deepEqual(a,generate(opts));
});
test('off-grid anchors, nonnumeric spacing and unsafe noise are rejected',()=>{
  for(const anchors of ['integers','0','-0.5','1,0.5'])
    assert.throws(()=>generate({...opts,anchors}),/anchors/);
  for(const v of ['-2.55','-3.1','1.1','-2.5,'])
    assert.throws(()=>generate({...opts,'anchor-values':v}),/anchor-values|Anchor/);
  assert.throws(()=>generate({...opts,'noise-mode':'symmetric',noise:'0.06'}),/too large/);
});
test('output is never overwritten',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fw-values-'));
  const target=path.join(dir,'values.js');
  try{
    main(['--start','-3','--end','1','--noise','0.04','--anchors','1','--output',target]);
    assert.match(fs.readFileSync(target,'utf8'),/id: '-3'/);
    assert.throws(()=>main(['--start','2','--end','3','--output',target]),/EEXIST/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('cli flag parsing supports numeric anchors and explicit values',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fw-values-'));
  const target=path.join(dir,'anchor.js');
  try{
    const proc=spawnSync(process.execPath,[path.join(__dirname,'..','generate-values.cjs'),
      '--start','-3','--end','1','--noise','0.04','--anchors','0.5',
      '--anchor-values','-2.7,0.3','--seed','42','--output',target],{encoding:'utf8'});
    assert.equal(proc.status,0,proc.stderr);
    assert.match(fs.readFileSync(target,'utf8'),/id: '-2.7'/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
