#!/usr/bin/env python3
"""Convert a fresh PreTeXt HTML build to approved Formula Wheels 22.0.

Patches only iframe src URLs corresponding to named <interactive> entries
whose source includes formula-wheels.js in source/**/*.ptx. Fail-closed before writing; keep file backups.
PreTeXt does not expose an official scheduling option in this integration.
Rebuild before applying this script again.
"""
from __future__ import annotations
import html
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'output' / 'web'
SOURCE = ROOT / 'source' / 'main.ptx'
PARENT_MARKER = 'FW_RC1_PARENT_SCHEDULER'
CHILD_MARKER = 'FW_RC1_CHILD_MATHJAX_CONFIG'
IFRAME_TAG = re.compile(r'<iframe\b[^>]*>',re.I|re.S)
SRC_ATTR = re.compile(r'''(?<![\w:-])src\s*=\s*(["'])(.*?)\1''',re.I|re.S)
LOADING_ATTR = re.compile(r'''(?<![\w:-])loading\s*=\s*(["'])(.*?)\1''',re.I|re.S)
HEAD_TAG = re.compile(r'<head(?:\s[^>]*)?>',re.I|re.S)


def interactives() -> dict[str,str]:
    """Find Formula Wheels interactives in this project's PreTeXt source tree.

    Other interactive platforms are ignored. A Formula Wheels source without
    an explicit xml:id is an authoring error because it cannot be safely
    associated with the generated PreTeXt iframe HTML.
    """
    ns='{http://www.w3.org/XML/1998/namespace}'
    result={}
    files=sorted((ROOT/'source').rglob('*.ptx'))
    if not files:raise ValueError('No PreTeXt .ptx files under source/')
    for file in files:
        tree=ET.parse(file)
        for el in tree.iter():
            if el.tag.split('}')[-1] != 'interactive':continue
            if 'formula-wheels.js' not in el.attrib.get('source',''):continue
            ident=el.attrib.get(ns+'id','')
            if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]*',ident):
                raise ValueError('Formula Wheels interactive needs a safe explicit xml:id in '+str(file))
            filename=ident+'-if.html'
            if filename in result:
                raise ValueError('Duplicate Formula Wheels interactive ID: '+ident)
            result[filename]=ident
    if not result:raise ValueError('No Formula Wheels interactives found in PreTeXt source/')
    return result


def inject_first_head(content:str,script:str,ident:str)->str:
    if PARENT_MARKER in content or CHILD_MARKER in content:
        raise ValueError('Already patched; rebuild PreTeXt before reapplying')
    head=HEAD_TAG.search(content)
    if not head or not re.search(r'</head\s*>',content[head.end():],re.I):
        raise ValueError('Expected a complete HTML <head>')
    if '<script' in content[:head.end()].lower():
        raise ValueError('Unexpected script before HTML <head> insertion point')
    return content[:head.end()] + '\n<script id="'+ident+'">\n'+script+'\n</script>\n' + content[head.end():]


def shield(content:str, expected:set[str]) -> tuple[str,list[str]]:
    found=[]
    def rewrite(match: re.Match)->str:
        tag=match.group(0)
        m=SRC_ATTR.search(tag)
        if not m:return tag
        original=html.unescape(m.group(2))
        parsed=urlsplit(original)
        basename=Path(unquote(parsed.path)).name
        if basename not in expected:return tag
        if parsed.scheme or parsed.netloc:
            raise ValueError('Formula Wheels iframe must be local: '+original)
        if basename in found:raise ValueError('Repeated Formula Wheels iframe: '+basename)
        found.append(basename)
        rewritten=tag[:m.start()]+('src="about:blank" data-fw-rc1-src="'+html.escape(original,quote=True)+'"')+tag[m.end():]
        l=LOADING_ATTR.search(rewritten)
        if l:rewritten=rewritten[:l.start()]+'loading="eager"'+rewritten[l.end():]
        else:rewritten=rewritten[:-1]+' loading="eager">'
        return rewritten
    result=IFRAME_TAG.sub(rewrite,content)
    return result,found


def stage(output:Path=OUTPUT) -> tuple[dict[Path,str],dict[str,str]]:
    if not output.is_dir():raise ValueError('Generated output/web missing. Build PreTeXt first.')
    refs=interactives()
    originals={}
    for filename in refs:
        target=output/filename
        if not target.is_file():raise ValueError('Generated Formula Wheels iframe missing: '+str(target))
        body=target.read_text(encoding='utf-8')
        if 'formula-wheels.js' not in body:
            raise ValueError('Unexpected child without Formula Wheels engine: '+str(target))
        originals[target]=body
    updates={}
    child_script=(ROOT/'src/child-mathjax-config.js').read_text(encoding='utf-8')
    parent_script=(ROOT/'src/iframe-scheduler.js').read_text(encoding='utf-8')
    for target,body in originals.items():
        inserted=inject_first_head(body,child_script,CHILD_MARKER)
        marker=inserted.index(CHILD_MARKER)
        if 'mathjax_startup.js' in inserted and marker>inserted.index('mathjax_startup.js'):
            raise ValueError('Child MathJax config does not precede startup: '+str(target))
        updates[target]=inserted
    present=set()
    parent_appearances={}
    for parent in sorted(output.glob('*.html')):
        if parent in originals:continue
        body=parent.read_text(encoding='utf-8')
        revised,found=shield(body,set(refs))
        if not found:continue
        # PreTeXt may publish the same article at more than one parent URL
        # (for example, a landing page and an article-specific page). Each
        # iframe must be unique WITHIN a parent page, but its appearance in a
        # different parent page is legitimate and needs the scheduler too.
        present.update(found)
        parent_appearances[parent.name]=tuple(found)
        originals[parent]=body
        updates[parent]=inject_first_head(revised,parent_script,PARENT_MARKER)
    if present!=set(refs):
        raise ValueError('Parent pages do not reference all expected iframe IDs: expected '+str(sorted(refs))+'; found '+str(sorted(present)))
    # Every Formula Wheels iframe still must be referenced at least once.
    # shield() already rejects duplicate references within a single page.
    # Multiple generated parents may legitimately share those references.
    for target in originals:
        if target.with_name(target.name+'.fw-rc1-unpatched').exists():
            raise ValueError('Backup already exists; rebuild before repatching: '+str(target))
    return updates,originals


def patch():
    updates,originals=stage()
    # All matching/validation is complete before any file is modified.
    for target,original in originals.items():
        target.with_name(target.name+'.fw-rc1-unpatched').write_text(original,encoding='utf-8')
    for target,updated in updates.items():target.write_text(updated,encoding='utf-8')
    count=sum(PARENT_MARKER in t for t in updates.values())
    print(f'PASS: patched {len(originals)-count} Formula Wheels children and {count} parent pages.')
    print('Child: enrichment on, generated speech and Braille off. Parent: unchanged.')
    print('Scheduler: first immediately, second 3000ms later, remaining >=250ms apart.')
    print('Backups: *.fw-rc1-unpatched; rebuild to start again.')

if __name__=='__main__':
    try:patch()
    except (ValueError,OSError,ET.ParseError) as exc:sys.exit('PATCH ERROR: '+str(exc))
