#!/usr/bin/env node
// Copyright (c) 2026 Forest Fisher. MPL-2.0.
// Created with extensive ChatGPT (OpenAI) assistance.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {parseFlags,writeNew,reportAndExit}=require('./cli-common.cjs');
const {generateOutputSpeech}=require('./output-speech-core.cjs');
const HELP=`Add SRE speech to the results of an authored permissibleOutputs() callback.

Usage:
  node tools/authoring/add-output-speech.cjs circle-logic.js [options]

Options:
  --rules clearspeak        clearspeak (default), mathspeak or chromevox
  --output FILE             Default: circle-logic.with-speech.js
  --binding NAME            Name of configuration object (default: configuration)
  --follow-up-rounds N      Follow generated selectable results in opposite direction
                            for N rounds; default: 1, allowed: 0 through 5
  --help                    Show this help

Input: a trusted, self-contained JavaScript authoring file with a variable
named "configuration", containing "variables" (canonical values arrays) and
"permissibleOutputs". It must contain mathematics only, not DOM mounting or
browser-only code. The callback is evaluated on the authored values, and
one extra round of reachable noncanonical selections by default.

Output: a NEW JavaScript file that retains the original source verbatim except
for an appended speech lookup and wrapper. The wrapper updates
configuration.permissibleOutputs before a separate exercise-mounting file runs.
Explicit entry speech is preserved. The output still works with the existing
Formula Wheels runtime. No SRE is shipped to student browsers.

IMPORTANT: Only run this tool on JavaScript YOU TRUST. It evaluates the author
file and callback; Node's vm is not a secure boundary for hostile code.
Finite exploration cannot guarantee speech for an unbounded output domain.
Review every proposed speech description before using it.`;
function defaultOutput(input){const ext=path.extname(input);return input.slice(0,-ext.length)+'.with-speech'+ext;}
async function main(argv){
  const {opts,rest}=parseFlags(argv,['rules','output','binding','follow-up-rounds'],1);
  if(opts.help){console.log(HELP);return;}
  const input=path.resolve(rest[0]);
  if(!['.js','.cjs'].includes(path.extname(input)))throw Error('Input must be a .js or .cjs file');
  const output=path.resolve(opts.output??defaultOutput(input));
  if(input===output)throw Error('Input and output must be different');
  if(fs.existsSync(output))throw Error(`Output exists; refusing to overwrite: ${output}`);
  const source=fs.readFileSync(input,'utf8');
  const domain=opts.rules??'clearspeak';
  const followUpRounds=opts['follow-up-rounds']===undefined?1:Number(opts['follow-up-rounds']);
  const binding=opts.binding??'configuration';
  // Validate JavaScript and callback before loading SRE.
  const {explore}=require('./output-speech-core.cjs');
  explore(source,{binding,followUpRounds});
  const {makeGenerator}=require('./speech-engine.cjs');
  const generator=await makeGenerator(domain);
  const result=await generateOutputSpeech(source,generator,{binding,followUpRounds,domain});
  const written=writeNew(output,result.source);
  console.log(`OUTPUT: ${written}`);
  console.log(`RULES: ${domain} | ${result.stats.calls} callback evaluations | ${result.stats.generatedOutputs} output entries | ${result.lookup.size} proposed speech descriptions | ${result.stats.existingSpeech} existing speech occurrences preserved`);
  console.log('Review the FW_OUTPUT_SPEECH_LOOKUP near the end of the generated file.');
}
if(require.main===module)main(process.argv.slice(2)).catch(reportAndExit);
module.exports={defaultOutput,main};
