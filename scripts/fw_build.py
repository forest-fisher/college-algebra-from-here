#!/usr/bin/env python3
# Copyright (c) 2026 Forest Fisher; MPL-2.0.
# Vibe coded with extensive ChatGPT (OpenAI) assistance.
"""Build a PreTeXt web target and install the pinned Formula Wheels hooks.

Usage from the textbook root:
  python scripts/fw_build.py web
  python scripts/fw_build.py --deploys
"""
from __future__ import annotations
import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def main():
    args=sys.argv[1:] or ['web']
    if args not in (['web'],['--deploys']):
        sys.exit('Usage: python scripts/fw_build.py [web|--deploys]')
    for command in (
        [sys.executable,str(ROOT/'scripts'/'fw_verify.py')],
        [sys.executable,'-m','pretext','build',*args],
        [sys.executable,str(ROOT/'scripts'/'fw_postbuild.py'),'--project-root',str(ROOT)],
    ):
        print('+ '+' '.join(command), flush=True)
        result=subprocess.run(command,cwd=ROOT,check=False)
        if result.returncode:sys.exit(result.returncode)

if __name__=='__main__':main()
