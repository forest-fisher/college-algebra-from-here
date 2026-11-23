// Copyright (c) 2026 Forest Fisher. MPL-2.0.
// Created with extensive ChatGPT (OpenAI) assistance.
'use strict';
// SRE runs only in the author's Node process, never in student iframes.
const {mathjax}=require('mathjax-full/js/mathjax.js');
const {TeX}=require('mathjax-full/js/input/tex.js');
const {liteAdaptor}=require('mathjax-full/js/adaptors/liteAdaptor.js');
const {RegisterHTMLHandler}=require('mathjax-full/js/handlers/html.js');
const {SerializedMmlVisitor}=require('mathjax-full/js/core/MmlTree/SerializedMmlVisitor.js');
const {STATE}=require('mathjax-full/js/core/MathItem.js');
const sre=require('speech-rule-engine');
const DOMAINS=new Set(['clearspeak','mathspeak','chromevox']);
RegisterHTMLHandler(liteAdaptor());
const input=new TeX({
  packages:['base','ams','newcommand'],
  // Fail, don't generate speech for malformed/unsupported TeX.
  formatError(_jax,error){throw error;}
});
const doc=mathjax.document('',{InputJax:input});
const visitor=new SerializedMmlVisitor();
async function makeGenerator(domain='clearspeak'){
  if(!DOMAINS.has(domain))throw Error('Rules must be clearspeak, mathspeak, or chromevox');
  await sre.setupEngine({locale:'en',modality:'speech',domain});
  await sre.engineReady();
  return (latex)=>{
    const mml=doc.convert(latex,{display:false,end:STATE.CONVERT});
    const str=visitor.visitTree(mml,doc);
    if(/<merror(?:\s|>)/.test(str))throw Error('MathJax failed to parse this expression');
    const output=sre.toSpeech(str);
    if(!output||!output.trim())throw Error('SRE returned no speech');
    return output.replace(/\s+/g,' ').trim();
  };
}
module.exports={DOMAINS,makeGenerator};
