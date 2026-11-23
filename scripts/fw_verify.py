#!/usr/bin/env python3
# Copyright (c) 2026 Forest Fisher; MPL-2.0.
# Vibe coded with extensive ChatGPT (OpenAI) assistance.
"""Fail closed if the textbook's pinned Formula Wheels files drift from lockfile.

22.1-C: validate a versioned, reviewed pin rather than hardcoding v1.0.0.
"""
from __future__ import annotations
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_REPOSITORY = 'https://github.com/forest-fisher/formula-wheels'
VERSION_PATTERN = re.compile(r'\d+\.\d+\.\d+\Z')
RUNTIME = (
    'src/formula-wheels.js',
    'src/formula-wheels.css',
    'src/iframe-scheduler.js',
    'src/child-mathjax-config.js',
)
REQUIRED_FILES = frozenset({
    'assets/code/formula-wheels.js',
    'assets/css/formula-wheels.css',
    'vendor/formula-wheels/LICENSE',
    'vendor/formula-wheels/NOTICE.md',
    'vendor/formula-wheels/PUBLIC_VERSION.json',
    'vendor/formula-wheels/RELEASE_MANIFEST_SHA256.json',
    'vendor/formula-wheels/tools/patch_pretext.py',
    *(f'vendor/formula-wheels/{name}' for name in RUNTIME),
})

# Added in v1.0.1: author-only scripts and documentation. Existing v1.0.0
# lockfiles remain valid, with the old inventory unchanged.
AUTHORING_SOURCE = ('tools/authoring/.gitignore', 'tools/authoring/LICENSE', 'tools/authoring/add-output-speech.cjs', 'tools/authoring/add-speech.cjs', 'tools/authoring/cli-common.cjs', 'tools/authoring/examples/circle-logic.js', 'tools/authoring/examples/sample-values.js', 'tools/authoring/generate-values.cjs', 'tools/authoring/output-speech-core.cjs', 'tools/authoring/package.json', 'tools/authoring/speech-core.cjs', 'tools/authoring/speech-engine.cjs', 'tools/authoring/tests/generate-values.test.cjs', 'tools/authoring/tests/output-speech.test.cjs', 'tools/authoring/tests/toolkit.test.cjs', 'docs/formula_wheels_authoring_tools.md')

def required_files(version: str):
    ver=tuple(int(part) for part in version.split('.'))
    if ver >= (1, 0, 1):
        return REQUIRED_FILES | frozenset('vendor/formula-wheels/'+p for p in AUTHORING_SOURCE)
    return REQUIRED_FILES

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def validate(root: Path = ROOT):
    lock = json.loads((root / 'formula-wheels.lock.json').read_text(encoding='utf-8'))
    version = lock['version']
    src = lock['source']
    if not isinstance(version, str) or not VERSION_PATTERN.fullmatch(version):
        raise ValueError('Invalid stable Formula Wheels version pin')
    if (src['repository'] != SOURCE_REPOSITORY or
            src['tag'] != f'v{version}' or
            src['asset'] != f'formula-wheels-v{version}.zip' or
            not re.fullmatch(r'[0-9a-f]{64}', src['assetSHA256'])):
        raise ValueError('Invalid Formula Wheels source pin')
    files = lock['files']
    if set(files) != required_files(version):
        raise ValueError('Formula Wheels lockfile inventory is incomplete or unexpected')
    for relative, expected in files.items():
        if not isinstance(expected, str) or not re.fullmatch(r'[0-9a-f]{64}', expected):
            raise ValueError(f'Invalid checksum for {relative}')
        path = root / relative
        if not path.is_file():
            raise ValueError(f'Missing pinned Formula Wheels file: {relative}')
        if digest(path.read_bytes()) != expected:
            raise ValueError(f'Pinned Formula Wheels file was modified: {relative}')
    for mirror, original in (
        ('assets/code/formula-wheels.js', 'src/formula-wheels.js'),
        ('assets/css/formula-wheels.css', 'src/formula-wheels.css'),
    ):
        if (root / mirror).read_bytes() != (root / 'vendor/formula-wheels' / original).read_bytes():
            raise ValueError(f'PreTeXt asset mirror differs from pinned source: {mirror}')
    meta = json.loads((root / 'vendor/formula-wheels/PUBLIC_VERSION.json').read_text(encoding='utf-8'))
    if (meta['publicVersion'] != version or meta['tag'] != src['tag'] or
            meta['releaseAsset'] != src['asset'] or meta['releaseAssetSHA256'] != src['assetSHA256']):
        raise ValueError('Public release metadata differs from lockfile')
    manifest = json.loads((root / 'vendor/formula-wheels/RELEASE_MANIFEST_SHA256.json').read_text(encoding='utf-8'))
    checked = manifest['files']
    for original in (*RUNTIME, 'tools/patch_pretext.py', 'LICENSE', 'NOTICE.md', *(AUTHORING_SOURCE if tuple(int(p) for p in version.split('.')) >= (1,0,1) else ())):
        if (not re.fullmatch(r'[0-9a-f]{64}', checked[original]) or
                checked[original] != files[f'vendor/formula-wheels/{original}']):
            raise ValueError(f'Approved release manifest mismatch for {original}')
    if set(meta['canonicalRuntimeSHA256']) != set(RUNTIME):
        raise ValueError('Unexpected official runtime inventory')
    for original in RUNTIME:
        if meta['canonicalRuntimeSHA256'][original] != checked[original]:
            raise ValueError(f'Official runtime checksum mismatch for {original}')
    print(f'PASS: Formula Wheels v{version} runtime, hooks, and asset mirrors match lockfile')

if __name__ == '__main__':
    try:
        validate()
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        sys.exit('FORMULA WHEELS PIN ERROR: ' + str(exc))
