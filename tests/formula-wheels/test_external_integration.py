#!/usr/bin/env python3
# Copyright (c) 2026 Forest Fisher; MPL-2.0.
# Vibe coded with extensive ChatGPT (OpenAI) assistance.
"""Portable postbuild contract tests against two independent PreTeXt-style pages.

This suite uses HTML fixtures, not browser or full PreTeXt generation.
"""
from __future__ import annotations
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('fw_adapter',ROOT/'scripts/fw_postbuild.py')
fw=importlib.util.module_from_spec(spec);spec.loader.exec_module(fw)

class PortableIntegration(unittest.TestCase):
    def setUp(self):
        self.dir=tempfile.TemporaryDirectory()
        self.root=Path(self.dir.name)
        self.source=self.root/'source';self.source.mkdir()
        self.output=self.root/'output/web';self.output.mkdir(parents=True)
        vendor=self.root/'vendor/formula-wheels';(vendor/'src').mkdir(parents=True);(vendor/'tools').mkdir(parents=True)
        upstream=ROOT/'vendor/formula-wheels'
        for p in ('src/iframe-scheduler.js','src/child-mathjax-config.js','tools/patch_pretext.py'):
            dst=vendor/p;dst.write_bytes((upstream/p).read_bytes())
        self.child='<html><head><script src="mathjax_startup.js"></script></head><body><script src="external/code/formula-wheels.js"></script></body></html>'
        self.parent='<html><head></head><body><iframe src="one-if.html" loading="lazy"></iframe><iframe src="other-if.html"></iframe></body></html>'
        self.write_xml('''<pretext><book><chapter><title>Test</title><figure><interactive xml:id="one" xmlns:xml="http://www.w3.org/XML/1998/namespace" source="code/formula-wheels.js code/fixture.js" platform="javascript"/></figure></chapter></book></pretext>''')
        (self.output/'one-if.html').write_text(self.child)
        (self.output/'main.html').write_text(self.parent)
    def tearDown(self):self.dir.cleanup()
    def write_xml(self,txt): (self.source/'main.ptx').write_text(txt)
    def test_external_project(self):
        n,p=fw.apply(self.root,self.output,self.source,True)
        self.assertEqual((n,p),(1,1))
        child=(self.output/'one-if.html').read_text();parent=(self.output/'main.html').read_text()
        self.assertLess(child.index('FW_RC1_CHILD_MATHJAX_CONFIG'),child.index('mathjax_startup.js'))
        self.assertIn('FW_RC1_PARENT_SCHEDULER',parent)
        self.assertIn('data-fw-rc1-src="one-if.html"',parent)
        self.assertIn('<iframe src="other-if.html"></iframe>',parent)
        self.assertFalse(list(self.output.glob('*.fw-rc1-unpatched')))
        self.assertTrue((self.root/'output/.formula-wheels-unpatched/web/one-if.html').is_file())
        with self.assertRaisesRegex(ValueError,'Already patched'):fw.apply(self.root,self.output,self.source,True)
    def test_repeat_after_fresh_pretext_rebuild(self):
        fw.apply(self.root,self.output,self.source,True)
        # PreTeXt replaces generated web pages but does not delete output/. backups.
        (self.output/'one-if.html').write_text(self.child)
        (self.output/'main.html').write_text(self.parent)
        self.assertEqual(fw.apply(self.root,self.output,self.source,True),(1,1))
        self.assertIn('FW_RC1_PARENT_SCHEDULER',(self.output/'main.html').read_text())
    def test_two_parents(self):
        (self.output/'index.html').write_text(self.parent)
        updates,originals,refs=fw.stage(self.root,self.output,self.source)
        self.assertEqual(len(refs),1)
        self.assertEqual(len(updates),3)
        self.assertEqual(len(originals),3)
    def test_missing_child_fails_without_modification(self):
        (self.output/'one-if.html').unlink()
        before=(self.output/'main.html').read_bytes()
        with self.assertRaisesRegex(ValueError,'was not generated'):fw.apply(self.root,self.output,self.source)
        self.assertEqual((self.output/'main.html').read_bytes(),before)
    def test_missing_parent_reference_fails_without_modification(self):
        (self.output/'main.html').write_text('<html><head></head><body></body></html>')
        with self.assertRaisesRegex(ValueError,'do not reference all'):fw.apply(self.root,self.output,self.source)
        self.assertFalse((self.root/'output/.formula-wheels-unpatched').exists())
    def test_no_wheels_is_no_op(self):
        self.write_xml('<pretext><book><title>Ordinary textbook</title></book></pretext>')
        (self.output/'one-if.html').unlink()
        before=(self.output/'main.html').read_bytes()
        self.assertEqual(fw.apply(self.root,self.output,self.source),(0,0))
        self.assertEqual((self.output/'main.html').read_bytes(),before)
    def test_duplicate_xml_id_is_rejected(self):
        self.write_xml('''<pretext xmlns:xml="http://www.w3.org/XML/1998/namespace"><book><interactive xml:id="one" source="code/formula-wheels.js"/><interactive xml:id="one" source="code/formula-wheels.js"/></book></pretext>''')
        with self.assertRaisesRegex(ValueError,'Duplicate'):fw.apply(self.root,self.output,self.source)
    def test_dry_run_never_writes(self):
        before=(self.output/'main.html').read_bytes()
        self.assertEqual(fw.apply(self.root,self.output,self.source,True,True),(1,1))
        self.assertEqual((self.output/'main.html').read_bytes(),before)
        self.assertFalse((self.root/'output/.formula-wheels-unpatched').exists())

if __name__=='__main__':unittest.main(verbosity=2)
