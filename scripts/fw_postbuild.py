#!/usr/bin/env python3
# Copyright (c) 2026 Forest Fisher; MPL-2.0.
# Vibe coded with extensive ChatGPT (OpenAI) assistance.
"""Portable PreTeXt Formula Wheels 1.0.0 integration (22.1-B candidate).

Reuses approved v1.0.0 inject_first_head()/shield() without modifying runtime.
The integration intentionally operates AFTER PreTeXt builds.  No changes when
there are no Formula Wheels <interactive> elements in a textbook.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import shutil
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

XML_ID = '{http://www.w3.org/XML/1998/namespace}id'
ENGINE = 'formula-wheels.js'


def paths(root: Path):
    return root/'vendor'/'formula-wheels'


def load_approved_helpers(root: Path):
    approved = paths(root)/'tools'/'patch_pretext.py'
    if not approved.is_file():
        raise ValueError(f'Missing approved patching helpers: {approved}')
    spec = importlib.util.spec_from_file_location('formula_wheels_approved_patcher', approved)
    if spec is None or spec.loader is None:
        raise ValueError(f'Unable to import approved patching helpers: {approved}')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def find_wheels(root: Path, source_dir: Path) -> dict[str, str]:
    result = {}
    files = sorted(source_dir.rglob('*.ptx'))
    if not files:
        raise ValueError(f'No PreTeXt source .ptx files found in {source_dir}')
    for file in files:
        tree = ET.parse(file)
        for element in tree.iter():
            if element.tag.split('}')[-1] != 'interactive':
                continue
            attr = element.attrib.get('source', '')
            if ENGINE not in attr:
                continue
            ident = element.attrib.get(XML_ID, '')
            if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]*', ident):
                raise ValueError(f'Formula Wheels interactive must have a safe explicit xml:id: {file}')
            filename = ident + '-if.html'
            if filename in result:
                raise ValueError(f'Duplicate Formula Wheels xml:id {ident!r}')
            result[filename] = ident
    return result


def stage(root: Path, output: Path, source_dir: Path, require_interactives: bool = False):
    """Validate all input and compute all replacements before writing anything."""
    if not output.is_dir():
        raise ValueError(f'PreTeXt output is missing: {output}. Build web first.')
    refs = find_wheels(root, source_dir)
    if not refs:
        if require_interactives:
            raise ValueError('Expected a Formula Wheels exercise, but none was found')
        return {}, {}, refs

    patcher = load_approved_helpers(root)
    vendor = paths(root)
    parent_code = (vendor/'src'/'iframe-scheduler.js').read_text(encoding='utf-8')
    child_code = (vendor/'src'/'child-mathjax-config.js').read_text(encoding='utf-8')
    originals = {}
    replacements = {}
    for name in refs:
        child = output/name
        if not child.is_file():
            raise ValueError(f'Formula Wheels child iframe was not generated: {child}')
        original = child.read_text(encoding='utf-8')
        if ENGINE not in original:
            raise ValueError(f'Formula Wheels engine missing from generated child: {child}')
        revised = patcher.inject_first_head(original, child_code, patcher.CHILD_MARKER)
        if 'mathjax_startup.js' in revised and revised.index(patcher.CHILD_MARKER)>revised.index('mathjax_startup.js'):
            raise ValueError(f'Child MathJax config inserted too late: {child}')
        originals[child] = original
        replacements[child] = revised

    referenced = set()
    for parent in sorted(output.glob('*.html')):
        if parent in originals:
            continue
        original = parent.read_text(encoding='utf-8')
        revised, found = patcher.shield(original, set(refs))
        if not found:
            continue
        referenced.update(found)
        replacements[parent] = patcher.inject_first_head(revised, parent_code, patcher.PARENT_MARKER)
        originals[parent] = original

    if referenced != set(refs):
        raise ValueError('Parent pages do not reference all Formula Wheels child iframes: '
                         f'missing={sorted(set(refs)-referenced)}; seen={sorted(referenced)}')
    return replacements, originals, refs


def apply(root: Path, output: Path, source_dir: Path, require_interactives: bool=False,
          dry_run: bool=False) -> tuple[int, int]:
    replacements, originals, refs = stage(root, output, source_dir, require_interactives)
    if not refs:
        print('PASS: no Formula Wheels interactives in source; PreTeXt output unchanged.')
        return 0, 0

    patcher = load_approved_helpers(root)
    parent_count = sum(patcher.PARENT_MARKER in t for t in replacements.values())
    if not dry_run:
        # Keep backups outside the published output/web tree.
        backup_root = root/'output'/'.formula-wheels-unpatched'/output.name
        # After a fresh PreTeXt rebuild, old backups are stale. stage() already
        # rejected any HTML still containing the historical patch markers.
        # Replace old backups only after all source/output checks have passed.
        if backup_root.exists():
            shutil.rmtree(backup_root)
        backup_root.mkdir(parents=True, exist_ok=False)
        try:
            for file, original in originals.items():
                (backup_root/file.name).write_text(original, encoding='utf-8')
            for file, modified in replacements.items():
                file.write_text(modified, encoding='utf-8')
        except OSError:
            # Restore original pages in case of an interrupted/partial write.
            for file, original in originals.items():
                file.write_text(original, encoding='utf-8')
            shutil.rmtree(backup_root, ignore_errors=True)
            raise
    child_count = len(refs)
    action = 'validated' if dry_run else 'patched'
    print(f'PASS: {action} {child_count} Formula Wheels child pages and {parent_count} parent pages.')
    print('Parent scheduler and child MathJax shim are byte-identical to approved v1.0.0.')
    return child_count, parent_count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project-root', default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument('--source-dir', default='source')
    parser.add_argument('--output-dir', default='output/web')
    parser.add_argument('--require-interactives', action='store_true')
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    root = Path(args.project_root).resolve()
    source = (root/args.source_dir).resolve()
    output = (root/args.output_dir).resolve()
    if not source.is_relative_to(root) or not output.is_relative_to(root):
        parser.error('Source/output directories must be within the project root')
    try:
        apply(root, output, source, args.require_interactives, args.check_only)
    except (ValueError, OSError, ET.ParseError) as exc:
        parser.exit(1, 'FORMULA WHEELS INTEGRATION ERROR: '+str(exc)+'\n')

if __name__ == '__main__':
    main()
