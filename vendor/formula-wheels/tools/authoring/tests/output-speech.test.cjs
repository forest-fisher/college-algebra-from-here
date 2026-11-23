'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const {explore,generateOutputSpeech,renderOutput}=require('../output-speech-core.cjs');
const root=path.resolve(__dirname,'..');
const circle=fs.readFileSync(path.join(root,'examples/circle-logic.js'),'utf8');
const synth=async latex=>`spoken: ${latex}`;
function config(source){const ctx=vm.createContext({});new vm.Script(source).runInContext(ctx);return vm.runInContext('configuration',ctx);}
const clean=x=>JSON.parse(JSON.stringify(x));
function dropSpeech(out){const remove=e=>{const x={...e};delete x.speech;return x;};return Array.isArray(out)?out.map(remove):{...out,options:out.options.map(remove)};}

test('canonical both ways plus reachable transient roots',()=>{
 const a=explore(circle);
 assert.ok(a.stats.calls>122);
 for(const latex of ['\\sqrt{4.59}','-\\sqrt{4.59}','\\sqrt{4.41}','0'])assert.ok(a.latex.includes(latex),latex);
});
test('follow-up rounds 0 only visits 122 canonical selections',()=>{
 const a=explore(circle,{followUpRounds:0});
 assert.equal(a.stats.calls,122);
 assert.ok(a.latex.includes('\\sqrt{4.59}'));
 assert.ok(!a.latex.includes('\\sqrt{4.41}'));
});
test('generated wrapper preserves preferredId, branchKey and mathematical outcomes',async()=>{
 const {source,lookup}=await generateOutputSpeech(circle,synth,{domain:'clearspeak'});
 assert.ok(lookup.has('\\sqrt{4.59}'));
 const original=config(circle),wrapped=config(source);
 const selected=original.variables.x.values.find(v=>v.id==='2.1');
 const raw=original.permissibleOutputs('x',selected);
 const enhanced=wrapped.permissibleOutputs('x',selected);
 assert.deepEqual(clean(dropSpeech(enhanced)),clean(raw));
 assert.equal(enhanced.preferredId,'positive-4.59');
 assert.equal(enhanced.options[0].branchKey,'negative');
 assert.equal(enhanced.options[1].speech,'spoken: \\sqrt{4.59}');
 assert.ok(!Object.hasOwn(raw.options[0],'speech'));
 assert.deepEqual(clean(wrapped.permissibleOutputs('x',selected)),clean(enhanced));
});
test('existing author speech and no-output arrays retained, no new lookup for authored',async()=>{
 const src=`const values=[{id:'1',latex:'1',value:1},{id:'0',latex:'0',value:0}];\n`+
 `const configuration={variables:{x:{values,initial:'1'},y:{strictlyDependent:true}},`+
 `permissibleOutputs(n,s){if(s.value===0)return [];return [{id:'out',latex:'root',value:1.4,speech:'my custom voice'}];}};`;
 const result=await generateOutputSpeech(src,synth);
 assert.equal(result.lookup.size,0);
 const enhanced=config(result.source);
 assert.equal(enhanced.permissibleOutputs('x',{id:'1',latex:'1',value:1})[0].speech,'my custom voice');
 assert.deepEqual(clean(enhanced.permissibleOutputs('x',{id:'0',latex:'0',value:0})),[]);
});
test('duplicate latex uses one description; original source is a prefix',async()=>{
 const src=`const configuration={variables:{x:{values:[{id:'1',latex:'1',value:1}]},y:{strictlyDependent:true}},`+
 `permissibleOutputs(){return [{id:'7',latex:'7',value:7}];}};\n`;
 const out=await generateOutputSpeech(src,synth);
 assert.equal(out.lookup.size,1);
 assert.ok(out.source.startsWith(src));
 assert.equal(config(out.source).permissibleOutputs('x',{id:'1',latex:'1',value:1})[0].speech,'spoken: 7');
});
test('fail closed for malformed results, invalid args and generated input',()=>{
 assert.throws(()=>explore('const configuration={variables:{x:{values:[{id:"1",latex:"1",value:1}]}},permissibleOutputs(){return null}};'),/return an array/);
 assert.throws(()=>explore(circle,{binding:'x;require'}),/binding/);
 assert.throws(()=>explore(renderOutput(circle,new Map())),/already contains generated/);
 assert.throws(()=>explore(circle,{followUpRounds:10}),/follow-up-rounds/);
});
test('unknown preferredId is preserved and treated as ordinary metadata',async()=>{
 const src=`const configuration={variables:{x:{values:[{id:'1',latex:'1',value:1}]},y:{strictlyDependent:false,values:[{id:'2',latex:'2',value:2}]}},`+
 `permissibleOutputs(){return {options:[{id:'a',latex:'5',value:5}],preferredId:'missing'};}};`;
 const out=await generateOutputSpeech(src,synth,{followUpRounds:0});
 assert.equal(config(out.source).permissibleOutputs('x',{id:'1',latex:'1',value:1}).preferredId,'missing');
});
test('callback errors describe variable and ID',()=>{
 const src=`const configuration={variables:{x:{values:[{id:'2',latex:'2',value:2}]}},permissibleOutputs(){throw new Error('author error')}};`;
 assert.throws(()=>explore(src),/permissibleOutputs\(x, 2\): author error/);
});
test('actual installed SRE ClearSpeak and MathSpeak',async()=>{
 const {makeGenerator}=require('../speech-engine.cjs');
 const src='const configuration={variables:{x:{values:[{id:"1",latex:"1",value:1}]},y:{strictlyDependent:true}},'+
   'permissibleOutputs(){return [{id:"a",latex:String.raw`\\sqrt{5}`,value:Math.sqrt(5)}];}};';
 const clear=await generateOutputSpeech(src,await makeGenerator('clearspeak'));
 const math=await generateOutputSpeech(src,await makeGenerator('mathspeak'),{domain:'mathspeak'});
 assert.match(clear.lookup.get('\\sqrt{5}'),/square root of 5/i);
 assert.match(math.lookup.get('\\sqrt{5}'),/StartRoot/);
});
test('CLI writes separate file then rejects overwrite',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fw-output-speech-'));
 try{
  const input=path.join(dir,'circle.js');fs.writeFileSync(input,circle);
  const args=[path.join(root,'add-output-speech.cjs'),input];
  const a=spawnSync(process.execPath,args,{encoding:'utf8'});
  assert.equal(a.status,0,a.stderr);
  assert.ok(fs.existsSync(path.join(dir,'circle.with-speech.js')));
  const b=spawnSync(process.execPath,args,{encoding:'utf8'});
  assert.equal(b.status,1);
  assert.match(b.stderr,/Output exists/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
