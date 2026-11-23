#!/usr/bin/env python3
# Copyright (c) 2026 Forest Fisher; MPL-2.0.
# Vibe coded with extensive ChatGPT (OpenAI) assistance.
"""Fail closed if the textbook's vendored Formula Wheels files drift from lockfile."""
from __future__ import annotations
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def validate(root:Path=ROOT):
    lock=json.loads((root/'formula-wheels.lock.json').read_text(encoding='utf-8'))
    if lock['version'] != '1.0.0' or lock['source']['tag'] != 'v1.0.0':
        raise ValueError('Unexpected Formula Wheels version pin')
    for relative, expected in lock['files'].items():
        path = root / relative
        if not path.is_file(): raise ValueError(f'Missing pinned Formula Wheels file: {relative}')
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(f'Pinned Formula Wheels file was modified: {relative}')
    if (root/'assets/code/formula-wheels.js').read_bytes()!=(root/'vendor/formula-wheels/src/formula-wheels.js').read_bytes():
        raise ValueError('PreTeXt JavaScript mirror differs from pinned source')
    if (root/'assets/css/formula-wheels.css').read_bytes()!=(root/'vendor/formula-wheels/src/formula-wheels.css').read_bytes():
        raise ValueError('PreTeXt CSS mirror differs from pinned source')
    print('PASS: Formula Wheels v1.0.0 runtime, integration hooks, and asset mirrors match lockfile')

if __name__=='__main__':
    try:validate()
    except (OSError,ValueError,KeyError, json.JSONDecodeError) as exc:
        sys.exit('FORMULA WHEELS PIN ERROR: '+str(exc))
