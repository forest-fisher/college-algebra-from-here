#!/usr/bin/env node
// Copyright (c) 2026 Forest Fisher. MPL-2.0.
// Created with extensive ChatGPT (OpenAI) assistance.
// Generate exact decimal values; never evaluate arbitrary author JavaScript.
'use strict';
const crypto=require('node:crypto');
const {parseFlags,writeNew,reportAndExit}=require('./cli-common.cjs');
const HELP=`Generate a Formula Wheels values array, without overwriting an existing file.
Usage: node tools/authoring/generate-values.cjs --start 2 --end 6 [options]
  --increment 0.1          Base increment (default: 0.1)
  --noise 0.04             Max noise magnitude (default: 0)
  --noise-mode positive    positive (default: away from zero) or symmetric
  --anchors 1             Preserve every multiple of 1 (zero-relative)
  --anchors 0.5           Preserve every multiple of 0.5
  --anchor-values 2.5,3.7 Protect explicitly listed base-grid values
                           (may be combined with --anchors)
  --seed 42                Reproducible pseudo-random seed (random if omitted)
  --name values            JavaScript array identifier (default: values)
  --output values.js       Write new file here (default: values.js)
Notes: endpoints always anchored. Positive mode adds noise to magnitude:
negative numbers shift downward, positive numbers shift upward; zero stays zero.
Symmetric mode allows positive/negative arithmetic shifts, including for zero.
Regular anchors are multiples relative to zero, NOT the starting value.
Anchors affect only points on the original grid; they never insert values.
Noise is chosen discretely, with precision inferred from --noise:
0.04 -> 0.01 steps; 0.005 -> 0.001 steps.
Start, end and increment must form an exact inclusive grid. Maximum 10,000 items.`;
const MAX_ITEMS=10000;
function asDecimal(input, label){
  const str=String(input);
  if(!/^-?(?:\d+)(?:\.\d{1,9})?$/.test(str))throw Error(`${label} must be a finite decimal (up to 9 decimal places), not ${str}`);
  return {str,precision:(str.split('.')[1]||'').length};
}
function bigintDecimal(value,precision){
  const sign=value<0n?'-':'';const abs=value<0n?-value:value;
  const scale=10n**BigInt(precision);
  let n=(abs/scale).toString();
  if(precision){const f=(abs%scale).toString().padStart(precision,'0').replace(/0+$/,'');if(f)n+='.'+f;}
  return sign+n;
}
function scaled(d,precision){
  const neg=d.str.startsWith('-');
  const str=neg?d.str.slice(1):d.str;
  const [whole,fraction='']=str.split('.');
  const number=BigInt(whole)*10n**BigInt(precision)+BigInt((fraction.padEnd(precision,'0'))||'0');
  return neg?-number:number;
}
function seededGenerator(seed){
  // FNV-1a seed folding + Mulberry32. Deterministic across supported Node versions.
  let state=2166136261;
  for(const b of Buffer.from(String(seed),'utf8')){state=Math.imul(state^b,16777619)>>>0;}
  return ()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
function generate(opts){
  const start=asDecimal(opts.start,'--start');
  const end=asDecimal(opts.end,'--end');
  const increment=asDecimal(opts.increment??'0.1','--increment');
  const noise=asDecimal(opts.noise??'0','--noise');
  const mode=opts['noise-mode']??'positive';
  if(!['positive','symmetric'].includes(mode))throw Error('--noise-mode must be positive or symmetric');
  const anchorPeriod=opts.anchors===undefined?null:asDecimal(opts.anchors,'--anchors');
  const anchorParam=opts['anchor-values']??'';
  const anchorTokens=anchorParam.split(',').map(t=>t.trim());
  if(opts['anchor-values']!==undefined && anchorTokens.some(t=>!t))
    throw Error('--anchor-values must be a comma-separated list of numbers');
  const anchorDefs=opts['anchor-values']===undefined?[]:
    anchorTokens.map(v=>asDecimal(v,'--anchor-values'));
  const precision=Math.max(start.precision,end.precision,increment.precision,
    noise.precision,anchorPeriod?.precision??0,...anchorDefs.map(x=>x.precision));
  const a=scaled(start,precision),b=scaled(end,precision),step=scaled(increment,precision),amount=scaled(noise,precision);
  const anchorSpacing=anchorPeriod===null?null:scaled(anchorPeriod,precision);
  if(anchorSpacing!==null && anchorSpacing<=0n)throw Error('--anchors must be a positive numeric spacing');
  if(step<=0n||b<a||amount<0n)throw Error('Require end >= start, increment > 0, and noise >= 0');
  if((b-a)%step!==0n)throw Error('The end must lie exactly on the start + n * increment grid');
  const total=(b-a)/step+1n;
  if(total>BigInt(MAX_ITEMS))throw Error(`Too many entries (${total}); maximum ${MAX_ITEMS}`);
  if(amount && (mode==='positive'?amount>=step:2n*amount>=step))
    throw Error(`Noise magnitude is too large for strictly increasing ${mode} values`);
  const anchorSet=new Set(anchorDefs.map(x=>scaled(x,precision).toString()));
  for(const item of anchorDefs){const v=scaled(item,precision);
    if(v<a||v>b||(v-a)%step!==0n)throw Error(`Anchor value ${item.str} does not lie on the base grid`);
  }
  const noiseUnit=amount ? 10n**BigInt(precision-noise.precision) : 1n;
  const maxNoiseSteps=amount/noiseUnit;
  if(maxNoiseSteps>1000000n)throw Error('Too many discrete noise possibilities');
  const seed=opts.seed??crypto.randomBytes(4).toString('hex');
  const random=seededGenerator(seed);
  const rows=[];
  let previous=null;
  for(let i=0n;i<total;i++){
    const base=a+i*step;
    let shift=0n;
    const anchored=(i===0n||i===total-1n||anchorSet.has(base.toString())||
      (anchorSpacing!==null&&base%anchorSpacing===0n)||
      (mode==='positive'&&base===0n));
    if(amount>0n&&!anchored){
      const n=Number(maxNoiseSteps);
      const chosen=mode==='positive'?Math.floor(random()*(n+1)):Math.floor(random()*(2*n+1))-n;
      shift=BigInt(chosen)*noiseUnit;
      // Positive mode increases absolute magnitude; symmetric mode remains
      // an arithmetic signed displacement, independent of the base's sign.
      if(mode==='positive'&&base<0n)shift=-shift;
    }
    const final=base+shift;
    if(previous!==null && final<=previous)throw Error('Generated array not strictly increasing');
    previous=final;
    rows.push(bigintDecimal(final,precision));
  }
  return {rows,seed,mode};
}
function render(rows,name){
  if(!/^[A-Za-z_$][\w$]*$/.test(name))throw Error('--name must be a valid simple JavaScript identifier');
  return `// Generated Formula Wheels values; review before using.\nconst ${name} = [\n`+
    rows.map(v=>`  { id: '${v}', latex: '${v}', value: ${v} },`).join('\n')+`\n];\n`;
}
function main(argv){const {opts}=parseFlags(argv,['start','end','increment','noise','noise-mode','anchors','anchor-values','seed','name','output']);
  if(opts.help){console.log(HELP);return;}
  if(opts.start===undefined||opts.end===undefined)throw Error('Both --start and --end are required');
  const {rows,seed,mode}=generate(opts);
  const output=opts.output??'values.js';
  const path=writeNew(output,render(rows,opts.name??'values'));
  console.log(`GENERATED: ${rows.length} entries -> ${path}`);
  console.log(`Noise mode: ${mode}; seed: ${seed}`);
}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){reportAndExit(e);}}
module.exports={asDecimal,scaled,bigintDecimal,seededGenerator,generate,render,main};
