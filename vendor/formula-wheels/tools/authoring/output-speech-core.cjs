// Copyright (c) 2026 Forest Fisher. MPL-2.0.
// Created with extensive ChatGPT (OpenAI) assistance.
'use strict';
const vm = require('node:vm');

const SOURCE_MARKER = '// FW_OUTPUT_SPEECH_GENERATED_BEGIN';
const DEFAULT_FOLLOW_UP_ROUNDS = 1;
const MAX_CALLS = 3000;
const MAX_DISTINCT_LATEX = 10000;

function validateEntry(entry, context) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
      typeof entry.id !== 'string' || !entry.id ||
      typeof entry.latex !== 'string' || !entry.latex.trim() ||
      typeof entry.value !== 'number' || !Number.isFinite(entry.value)) {
    throw Error(`${context}: expected {id: string, latex: string, value: finite number}`);
  }
  if (Object.hasOwn(entry, 'speech') &&
      (typeof entry.speech !== 'string' || !entry.speech.trim())) {
    throw Error(`${context}: existing speech must be nonempty text`);
  }
}

function validateResult(result, context) {
  const isList = Array.isArray(result);
  const options = isList ? result : result && typeof result === 'object' && result.options;
  if (!Array.isArray(options)) throw Error(`${context}: return an array or {options: array, preferredId?: string}`);
  const ids = new Set();
  for (let i=0; i<options.length; i++) {
    const entry = options[i];
    validateEntry(entry, `${context} output ${i+1}`);
    if (ids.has(entry.id)) throw Error(`${context}: duplicate output ID ${JSON.stringify(entry.id)}`);
    ids.add(entry.id);
  }
  // Keep the approved runtime's precedence: an absent, unknown or non-string
  // preferredId is simply not a preference. Do not change author metadata.
  return options;
}

function explore(source, {binding='configuration', followUpRounds=DEFAULT_FOLLOW_UP_ROUNDS}={}) {
  if (!/^[A-Za-z_$][\w$]*$/.test(binding)) throw Error('--binding must be a simple JavaScript identifier');
  if (!Number.isSafeInteger(followUpRounds) || followUpRounds<0 || followUpRounds>5)
    throw Error('--follow-up-rounds must be an integer between 0 and 5');
  if (source.includes(SOURCE_MARKER)) throw Error('Input already contains generated speech; use the original source');
  // The authoring source is trusted local JavaScript. vm is a timeout mechanism,
  // NOT a security boundary against malicious JavaScript. Never execute third-party input.
  const context = vm.createContext(Object.create(null), {name:'Formula Wheels trusted authoring input'});
  const script = new vm.Script(source, {filename:'author-input.js'});
  script.runInContext(context,{timeout:1500});
  let config;
  try {config=vm.runInContext(binding,context,{timeout:500});}
  catch {throw Error(`No ${binding} object found. Supply a plain authoring file defining const ${binding} = {...}`);}
  if (!config || typeof config !== 'object' || !config.variables ||
      typeof config.permissibleOutputs !== 'function') {
    throw Error(`${binding} must have variables and a permissibleOutputs function`);
  }
  const variables = Object.entries(config.variables).filter(([,spec])=>
    spec && typeof spec === 'object' && !Object.hasOwn(spec,'fixed'));
  if (!variables.length) throw Error('No varying variables found');
  if (variables.length>2) throw Error('Prototype supports at most two varying variables');
  const eligible = new Map();
  const seen = new Map();
  const queue=[];
  for (const [name,spec] of variables) {
    if (!Array.isArray(spec.values)) {
      if (spec.strictlyDependent) continue;
      throw Error(`${name}: a manipulable variable must supply a values array`);
    }
    const idSet=new Set();
    for (const entry of spec.values) {
      validateEntry(entry,`${name} canonical entry`);
      if (idSet.has(entry.id))throw Error(`${name}: duplicate canonical ID ${JSON.stringify(entry.id)}`);
      idSet.add(entry.id);
      queue.push({variable:name,entry,depth:0});
    }
    eligible.set(name,true);
    seen.set(name,new Set());
  }
  if (!queue.length) throw Error('No canonical input values were found');
  let calls=0, generatedOutputs=0, existingSpeech=0, duplicates=0;
  const latexWithoutSpeech=new Set();
  const encountered=new Set();
  for (let i=0;i<queue.length;i++) {
    const {variable,entry,depth}=queue[i];
    const identity=JSON.stringify([entry.id,entry.latex,entry.value]);
    const visited=seen.get(variable);
    if (visited.has(identity)) { duplicates++;continue; }
    visited.add(identity);
    if (++calls>MAX_CALLS) throw Error(`Exceeded ${MAX_CALLS} callback evaluations; reduce values or follow-up rounds`);
    context.__fw_changed_variable=variable;
    context.__fw_selected_entry=entry;
    let result;
    try {
      result=vm.runInContext(`${binding}.permissibleOutputs(__fw_changed_variable, __fw_selected_entry)`,context,{timeout:700});
    } catch (err) {throw Error(`permissibleOutputs(${variable}, ${entry.id}): ${err.message}`);}
    const outputs=validateResult(result,`permissibleOutputs(${variable}, ${entry.id})`);
    if (variables.length===2) {
      const other=variables.find(([name])=>name!==variable)?.[0];
      if (other && config.variables[other].strictlyDependent && outputs.length>1) {
        throw Error(`Strictly dependent ${other} may not have multiple output options`);
      }
    }
    generatedOutputs+=outputs.length;
    for (const output of outputs) {
      encountered.add(output.latex);
      if (Object.hasOwn(output,'speech')) existingSpeech++;
      else latexWithoutSpeech.add(output.latex);
      if (encountered.size>MAX_DISTINCT_LATEX) throw Error('Too many distinct output expressions');
      if (depth<followUpRounds) {
        // Only manipulable counterpart values can subsequently become selections.
        const other=variables.find(([name])=>name!==variable)?.[0];
        if (other && eligible.has(other)) {
          queue.push({variable:other,entry:output,depth:depth+1});
        }
      }
    }
  }
  return {latex:[...latexWithoutSpeech].sort(),stats:{calls,generatedOutputs,existingSpeech,
    uniqueLatex:encountered.size,followUpRounds,duplicates}};
}

function renderOutput(source, lookup, {binding='configuration',domain='clearspeak',stats}={}) {
  const pairs=[...lookup.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  const json=JSON.stringify(pairs,null,2).split('\n').map((line,i)=>i===0?line:'  '+line).join('\n');
  const appendix=`\n\n${SOURCE_MARKER}\n`+
`// Generated author-time speech suggestions (${domain}). Review the text below.\n`+
`// ${stats?.calls??'?'} author callback evaluations; ${pairs.length} generated phrases.\n`+
`// Original permissibleOutputs math and existing speech overrides are untouched.\n`+
`const FW_OUTPUT_SPEECH_LOOKUP = new Map(${json});\n`+
`function FW_attachOutputSpeech(result) {\n`+
`  const add = entry => {\n`+
`    if (Object.prototype.hasOwnProperty.call(entry, 'speech')) return entry;\n`+
`    const speech = FW_OUTPUT_SPEECH_LOOKUP.get(entry.latex);\n`+
`    return speech === undefined ? entry : {...entry, speech};\n`+
`  };\n`+
`  if (Array.isArray(result)) return result.map(add);\n`+
`  return {...result, options: result.options.map(add)};\n`+
`}\n`+
`const FW_originalPermissibleOutputs = ${binding}.permissibleOutputs.bind(${binding});\n`+
`${binding}.permissibleOutputs = function(changedVariable, selected) {\n`+
`  return FW_attachOutputSpeech(FW_originalPermissibleOutputs(changedVariable, selected));\n`+
`};\n`+
`// FW_OUTPUT_SPEECH_GENERATED_END\n`;
  const code=source.replace(/\s*$/,'')+appendix;
  new vm.Script(code,{filename:'generated-with-speech.js'});
  return code;
}

async function generateOutputSpeech(source, makeSpeech, opts={}) {
  const {latex,stats}=explore(source,opts);
  const lookup=new Map();
  const failures=[];
  for (const expr of latex) {
    try {
      const description=await makeSpeech(expr);
      if (typeof description!=='string'||!description.trim())throw Error('empty speech description');
      lookup.set(expr,description.trim());
    } catch (e) {failures.push(`${expr}: ${e.message}`);}
  }
  if(failures.length){throw Error(`Speech generation failed for ${failures.length} expressions:\n- ${failures.slice(0,12).join('\n- ')}${failures.length>12?'\n- ...':''}\nNo output file written.`);}
  return {source:renderOutput(source,lookup,{...opts,stats}),lookup,stats};
}
module.exports={explore,renderOutput,generateOutputSpeech,validateResult,SOURCE_MARKER};
