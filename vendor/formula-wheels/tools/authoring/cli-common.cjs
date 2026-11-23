// Copyright (c) 2026 Forest Fisher. MPL-2.0.
// Created with extensive ChatGPT (OpenAI) assistance.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
function parseFlags(args, flags, positionals=0) {
  const opts={}, rest=[];
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if(arg==='--help'||arg==='-h'){opts.help=true;continue;}
    if(arg.startsWith('--')){
      const [key,inline] = arg.slice(2).split(/=(.*)/s,2);
      if(!flags.includes(key)) throw Error(`Unknown option: --${key}`);
      let val=inline;
      if(val===undefined){if(i+1>=args.length||args[i+1].startsWith('--'))throw Error(`--${key} needs a value`); val=args[++i];}
      if(Object.hasOwn(opts,key))throw Error(`Option --${key} specified twice`);
      opts[key]=val;
    }else rest.push(arg);
  }
  if(!opts.help && rest.length!==positionals) throw Error(`Expected ${positionals} positional argument(s); found ${rest.length}`);
  return {opts,rest};
}
function writeNew(file,content){
  const target=path.resolve(file);
  // wx ensures no files (including the input) are silently overwritten.
  fs.writeFileSync(target,content,{encoding:'utf8',flag:'wx'});
  return target;
}
function reportAndExit(e){console.error('ERROR:',e.message);process.exitCode=1;}
module.exports={parseFlags,writeNew,reportAndExit};
