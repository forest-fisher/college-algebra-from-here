#!/usr/bin/env node
// Copyright (c) 2026 Forest Fisher. MPL-2.0.
// Created with extensive ChatGPT (OpenAI) assistance.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {parseFlags,writeNew,reportAndExit}=require('./cli-common.cjs');
const {transform}=require('./speech-core.cjs');
const HELP=`Add proposed mathematical speech to static Formula Wheels entries.
Usage: node tools/authoring/add-speech.cjs values.js [options]
  --rules clearspeak     Choose clearspeak (default), mathspeak, or chromevox
  --output output.js      Default: values.with-speech.js
Targets object literals containing id, latex and value. Supports string literals
and String.raw\`...\` with no substitutions; never executes input JavaScript.
Existing speech properties are preserved. Writes a NEW file only (no overwrite).
Unsupported/dynamic LaTeX is reported and left untouched. Review every
proposed speech string before using the output in Formula Wheels.`;
function defaultOutput(file){const ext=path.extname(file);return file.slice(0,-ext.length)+'.with-speech'+ext;}
async function main(argv){
  const {opts,rest}=parseFlags(argv,['rules','output'],1);
  if(opts.help){console.log(HELP);return;}
  const input=path.resolve(rest[0]);
  if(path.extname(input)!=='.js'&&path.extname(input)!=='.cjs'&&path.extname(input)!=='.mjs')
    throw Error('Input must be a .js, .cjs, or .mjs JavaScript file');
  const output=path.resolve(opts.output??defaultOutput(input));
  if(input===output)throw Error('Output must differ from input; input is never overwritten');
  if(fs.existsSync(output))throw Error(`Output already exists: ${output}`);
  const source=fs.readFileSync(input,'utf8');
  // Load SRE only after validating input and destination path.
  const {makeGenerator}=require('./speech-engine.cjs');
  const domain=opts.rules??'clearspeak';
  const generator=await makeGenerator(domain);
  const result=await transform(source,generator);
  if(result.found===0)throw Error('No Formula Wheels entries with id, latex and value found; no output written');
  const written=writeNew(output,result.source);
  console.log(`OUTPUT: ${written}`);
  console.log(`RULES: ${domain} | ${result.added} speech descriptions added | ${result.existing} preserved | ${result.issues.length} need manual review`);
  for(const message of result.issues)console.warn('REVIEW:',message);
  if(result.issues.length)process.exitCode=2;
}
if(require.main===module)main(process.argv.slice(2)).catch(reportAndExit);
module.exports={defaultOutput,main};
