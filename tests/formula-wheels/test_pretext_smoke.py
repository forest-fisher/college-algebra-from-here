#!/usr/bin/env python3
# Copyright (c) 2026 Forest Fisher; MPL-2.0.
# Vibe coded with extensive ChatGPT (OpenAI) assistance.
"""PreTeXt 2.56.2 independent-consumer smoke test (runs in Codespaces / CI).

Creates a new book using the textbook's familiar project layout, builds it,
then verifies external project patching with three Formula Wheels iframes.
"""
from __future__ import annotations
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

BOOK=Path(__file__).resolve().parents[2]

def run():
    sys.path.insert(0,str(BOOK/'scripts'))
    from fw_postbuild import apply
    from fw_verify import validate
    validate(BOOK)
    with tempfile.TemporaryDirectory(prefix='fw-pretext-consumer-') as d:
        root=Path(d)
        for folder in ('source','assets/code','assets/css','vendor/formula-wheels/src','vendor/formula-wheels/tools','publication'):
            (root/folder).mkdir(parents=True,exist_ok=True)
        for f in ('src/iframe-scheduler.js','src/child-mathjax-config.js','tools/patch_pretext.py'):
            shutil.copy2(BOOK/'vendor/formula-wheels'/f,root/'vendor/formula-wheels'/f)
        for f in ('assets/code/formula-wheels.js','assets/css/formula-wheels.css'):
            shutil.copy2(BOOK/f,root/f)
        project='''<?xml version="1.0" encoding="utf-8"?>
<project ptx-version="2"><targets><target name="web" format="html"><stringparams html.css.extra="external/css/custom.css"/></target></targets></project>'''
        (root/'project.ptx').write_text(project,encoding='utf-8')
        (root/'assets/css/custom.css').write_text('/* textbook-style custom stylesheet */\n')
        # A minimal representation of the book's denver theme and sourced external assets.
        (root/'publication/publication.ptx').write_text('<publication><html><css theme="denver"/></html></publication>')
        # Two iframes, one display-only and one interactive; two different chapter sections.
        (root/'source/main.ptx').write_text('''<?xml version="1.0" encoding="UTF-8"?>
<pretext xml:lang="en-US" xmlns:xi="http://www.w3.org/2001/XInclude">
<docinfo><directories external="../assets"/></docinfo>
<book xml:id="fw-integration-consumer"><title>Independent Consumer</title>
<chapter xml:id="chapter-a"><title>A</title><section xml:id="section-a"><title>One</title>
<figure><caption>Interactive wheel</caption>
<interactive xml:id="fw-external-interactive" platform="javascript" width="95%" aspect="2:1" source="code/formula-wheels.js code/test-interactive.js" css="css/formula-wheels.css">
<slate surface="html" aspect="2:1"><div xmlns="http://www.w3.org/1999/xhtml" id="formula-wheels" class="formula-wheels"></div></slate>
</interactive></figure></section>
<section xml:id="section-b"><title>Two</title>
<figure><caption>Display-only formula</caption>
<interactive xml:id="fw-external-display" platform="javascript" width="95%" aspect="2:1" source="code/formula-wheels.js code/gallery-fixture.js code/test-display.js" css="css/formula-wheels.css">
<slate surface="html" aspect="2:1"><div xmlns="http://www.w3.org/1999/xhtml" id="formula-wheels" class="formula-wheels"></div></slate>
</interactive></figure></section>
<section xml:id="section-c"><title>Three</title>
<figure><caption>Wheel with a separate JSXGraph slate</caption>
<interactive xml:id="fw-external-jsxgraph" platform="jsxgraph" width="95%" aspect="1:1" source="code/formula-wheels.js code/test-jsxgraph.js" css="css/formula-wheels.css css/test-jsxgraph.css">
<slate surface="html" aspect="2:1"><div xmlns="http://www.w3.org/1999/xhtml" id="formula-wheels" class="formula-wheels"></div></slate>
<slate xml:id="example-board" surface="jsxboard" aspect="5:2"/>
</interactive></figure></section></chapter>
</book></pretext>''')
        # Use accepted gallery exercise code, not a newly invented API fixture.
        # The first script is independent; gallery-fixture is only for display mode.
        gallery=BOOK/'tests/formula-wheels/fixture'
        shutil.copy2(gallery/'test-interactive.js',root/'assets/code/test-interactive.js')
        shutil.copy2(gallery/'test-display.js',root/'assets/code/test-display.js')
        shutil.copy2(gallery/'gallery-fixture.js',root/'assets/code/gallery-fixture.js')
        shutil.copy2(gallery/'test-jsxgraph.js',root/'assets/code/test-jsxgraph.js')
        shutil.copy2(gallery/'test-jsxgraph.css',root/'assets/css/test-jsxgraph.css')
        print('Building an independent PreTeXt 2.56.2 project with three Formula Wheels instances...',flush=True)
        subprocess.run([sys.executable,'-m','pretext','build','web'],cwd=root,check=True)
        out=root/'output/web'
        child_count,parent_count=apply(root,out,root/'source',True)
        assert child_count==3 and parent_count>=1,(child_count,parent_count)
        pages=[x.read_text(encoding='utf-8') for x in out.glob('*.html')]
        assert any('FW_RC1_PARENT_SCHEDULER' in p for p in pages)
        assert sum('FW_RC1_CHILD_MATHJAX_CONFIG' in p for p in pages)==3
        assert not list(out.glob('*.fw-rc1-unpatched'))
        print('PASS: independent three-section PreTeXt 2.56.2 build and post-build integration',flush=True)

if __name__=='__main__':
    try:run()
    except (OSError,ValueError,subprocess.CalledProcessError,AssertionError) as exc:
        sys.exit('INDEPENDENT PRETEXT SMOKE FAILED: '+str(exc))
