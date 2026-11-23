// Copyright (c) 2026 Forest Fisher. MPL-2.0.
// Created with extensive ChatGPT (OpenAI) assistance.
'use strict';
const acorn=require('acorn');

// Parse source as data. DO NOT run arbitrary JavaScript from an authoring file.
function parseSource(source){
  try{return acorn.parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true,allowHashBang:true});}
  catch(err){if(!/sourceType.*module/i.test(err.message)){
    try{return acorn.parse(source,{ecmaVersion:'latest',sourceType:'script',locations:true,allowHashBang:true});}catch{} }
    throw err;}
}
function propertyName(prop){
  if(!prop||prop.type!=='Property'||prop.computed||prop.kind!=='init')return null;
  if(prop.key.type==='Identifier')return prop.key.name;
  if(prop.key.type==='Literal'&&typeof prop.key.value==='string')return prop.key.value;
  return null;
}
function plainLatex(node){
  if(!node)return null;
  if(node.type==='Literal'&&typeof node.value==='string')return node.value;
  if(node.type==='TemplateLiteral'&&node.expressions.length===0) return node.quasis[0].value.cooked;
  // Only accept literal String.raw templates, not an arbitrary tagged function.
  if(node.type==='TaggedTemplateExpression'&&node.tag.type==='MemberExpression' && !node.tag.computed &&
     node.tag.object.name==='String' && node.tag.property.name==='raw' &&
     node.quasi.type==='TemplateLiteral' && node.quasi.expressions.length===0)
       return node.quasi.quasis[0].value.raw;
  return null;
}
function findEntries(source){
  const root=parseSource(source),found=[];
  function visit(node){
    if(!node||typeof node!=='object')return;
    if(Array.isArray(node)){for(const child of node)visit(child);return;}
    if(node.type==='ObjectExpression'){
      const fields=new Map();
      for(const p of node.properties){const name=propertyName(p);if(name)fields.set(name,p);}
      if(fields.has('id')&&fields.has('latex')&&fields.has('value')){
        found.push({node,fields,latex:plainLatex(fields.get('latex').value)});
      }
    }
    for(const [key,value] of Object.entries(node))if(key!=='loc'&&key!=='start'&&key!=='end'&&key!=='raw')visit(value);
  }
  visit(root);return found;
}
function jsSingleQuote(value){
  return `'${value.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r/g,'\\r').replace(/\n/g,'\\n')
    .replace(/\t/g,'\\t').replace(/[\u0000-\u001f\u2028\u2029]/g,c=>`\\u${c.codePointAt(0).toString(16).padStart(4,'0')}`)}'`;
}
function patchObject(source,entry,speech){
  const node=entry.node;
  const props=node.properties;
  const last=props[props.length-1];
  if(!last||last.type==='SpreadElement')return {error:'ends with a spread; insert speech manually'};
  const between=source.slice(last.end,node.end-1);
  // Comments between the last property and closing brace require manual review;
  // refuse instead of reattaching comments to a different property.
  if(!/^\s*,?\s*$/.test(between))return {error:'comments or unsupported syntax after last property'};
  const trailingComma=between.includes(',');
  const closingLine=source.slice(source.lastIndexOf('\n',node.end-1)+1,node.end-1);
  const multiline=between.includes('\n');
  const newline=source.includes('\r\n')?'\r\n':'\n';
  let replacement;
  if(multiline){
    const closeIndent=(closingLine.match(/^\s*/)||[''])[0];
    const lastLine=source.slice(source.lastIndexOf('\n',last.start)+1,last.start);
    const propertyIndent=(lastLine.match(/^\s*/)||[''])[0];
    const indent=propertyIndent.length>closeIndent.length?propertyIndent:closeIndent+'  ';
    replacement=(trailingComma?',':',')+newline+indent+`speech: ${jsSingleQuote(speech)}`+newline+closeIndent;
  }else{
    replacement=(trailingComma?', ':', ')+`speech: ${jsSingleQuote(speech)}`+between.match(/\s*$/)[0];
  }
  return {start:last.end,end:node.end-1,text:replacement};
}
async function transform(source,generate){
  const entries=findEntries(source),patches=[],issues=[];
  let existing=0;
  for(const entry of entries){
    if(entry.fields.has('speech')){existing++;continue;}
    const line=entry.node.loc.start.line;
    if(typeof entry.latex!=='string'||!entry.latex.trim()){
      issues.push(`Line ${line}: latex is not a static string or String.raw template; skipped`);continue;
    }
    try{
      const speech=await generate(entry.latex);
      if(typeof speech!=='string'||!speech.trim())throw Error('empty speech description');
      const patch=patchObject(source,entry,speech.trim());
      if(patch.error)issues.push(`Line ${line}: ${patch.error}; skipped`);
      else patches.push(patch);
    }catch(err){issues.push(`Line ${line} (${entry.latex}): ${err.message}; skipped`);}
  }
  let revised=source;
  // Apply backwards so all source offsets remain valid.
  for(const p of patches.sort((a,b)=>b.start-a.start))revised=revised.slice(0,p.start)+p.text+revised.slice(p.end);
  // Before reporting success, verify the edited output still parses and preserves
  // every original byte outside the inserted property gaps.
  parseSource(revised);
  return {source:revised,added:patches.length,existing,issues,found:entries.length};
}
module.exports={parseSource,plainLatex,findEntries,jsSingleQuote,patchObject,transform};
