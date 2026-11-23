#!/usr/bin/env python3
"""Offline 22.1-C release validation and mutation tests; no network needed."""
from __future__ import annotations
import hashlib
import io
import json
import shutil
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT / 'scripts'))
from fw_update_check import (PINNED_SOURCE, sha, stable_version, choose_release,
                             inspect_release, plan, apply, official_assets)
from fw_verify import REQUIRED_FILES, AUTHORING_SOURCE, required_files, validate


def fake_assets(tag: str, archive: bytes, meta: bytes, sums: bytes):
    names = {f'formula-wheels-{tag}.zip': archive,
             'PUBLIC_VERSION.json': meta, 'SHA256SUMS.txt': sums}
    release = {'tag_name': tag, 'prerelease': False, 'draft': False, 'assets': [
        {'name': name, 'state': 'uploaded', 'digest': 'sha256:' + sha(data),
         'browser_download_url':
         f'https://github.com/forest-fisher/formula-wheels/releases/download/{tag}/{name}'}
        for name, data in names.items()
    ]}
    return release, names


def fixture(root: Path, tag=None):
    if tag is None:
        current = json.loads((root/'formula-wheels.lock.json').read_text())['version']
        parts = [int(x) for x in current.split('.')]
        tag = f'v{parts[0]}.{parts[1]}.{parts[2]+1}'
    entries = {part: (root/'vendor'/'formula-wheels'/part).read_bytes()
               for part in PINNED_SOURCE if part != 'RELEASE_MANIFEST_SHA256.json'}
    if tuple(int(p) for p in tag[1:].split('.')) >= (1, 0, 1):
        for name in AUTHORING_SOURCE:
            path = root/'vendor'/'formula-wheels'/name
            entries[name] = path.read_bytes() if path.is_file() else f'fixture authoring {name}\n'.encode()
    # Choose a harmless hypothetical newer release with the same approved runtime bytes.
    manifest = {'release': '22.0', 'checksumAlgorithm': 'SHA-256',
                'files': {name: sha(data) for name, data in entries.items()}}
    entries['RELEASE_MANIFEST_SHA256.json'] = (json.dumps(manifest)+'\n').encode()
    contents = io.BytesIO()
    with zipfile.ZipFile(contents, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in entries.items():
            archive.writestr(name, data)
    bundle = contents.getvalue()
    metadata = {
        'publicVersion': tag[1:], 'tag': tag,
        'releaseAsset': f'formula-wheels-{tag}.zip',
        'releaseAssetSHA256': sha(bundle),
        'canonicalRuntimeSHA256': {name:sha(entries[name]) for name in PINNED_SOURCE[:4]},
    }
    meta = (json.dumps(metadata,indent=2)+'\n').encode()
    sums = (f'{sha(bundle)}  formula-wheels-{tag}.zip\n').encode()
    return fake_assets(tag, bundle, meta, sums)


class UpdateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        validate(PROJECT)

    def setUp(self):
        self.work = tempfile.TemporaryDirectory(prefix='fw221c-')
        self.root = Path(self.work.name)
        source_lock = json.loads((PROJECT / 'formula-wheels.lock.json').read_text())
        for part in ('formula-wheels.lock.json', *source_lock['files']):
            out = self.root/part
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(PROJECT/part,out)

    def tearDown(self):
        self.work.cleanup()

    def test_current_pin(self):
        validate(self.root)
        self.assertEqual(stable_version('v1.2.3'), (1,2,3))
        with self.assertRaises(ValueError): stable_version('v1.2.3-beta.1')

    def test_stable_only_and_no_downgrade(self):
        release, _ = fixture(self.root)
        current = json.loads((self.root/'formula-wheels.lock.json').read_text())['version']
        next_version = release['tag_name'][1:]
        self.assertTrue(choose_release(current, release))
        self.assertFalse(choose_release(next_version, release))
        parts = [int(x) for x in next_version.split('.')]
        future = f'{parts[0]}.{parts[1]}.{parts[2]+1}'
        self.assertFalse(choose_release(future, release))
        for flag in ('draft', 'prerelease'):
            invalid = dict(release)
            invalid[flag] = True
            with self.assertRaises(ValueError): choose_release(current, invalid)
        invalid = dict(release, tag_name=release['tag_name']+'-rc.1')
        with self.assertRaises(ValueError): choose_release(current, invalid)

    def test_valid_upgrade_and_verifier(self):
        release, blobs = fixture(self.root)
        before = (self.root/'formula-wheels.lock.json').read_bytes()
        changes = plan(self.root, release, blobs)
        next_version=release['tag_name'][1:]
        self.assertEqual(set(changes), set(required_files(next_version)) | {'formula-wheels.lock.json'})
        self.assertEqual((self.root/'formula-wheels.lock.json').read_bytes(), before)
        apply(self.root, changes)
        validate(self.root)
        lock = json.loads((self.root/'formula-wheels.lock.json').read_text())
        self.assertEqual(lock['version'], next_version)
        self.assertEqual(lock['source']['tag'], release['tag_name'])
        self.assertEqual(lock['source']['assetSHA256'], sha(blobs[f'formula-wheels-{release["tag_name"]}.zip']))


    def test_101_authoring_files_are_installed_and_verified(self):
        release, blobs = fixture(self.root)
        changes = plan(self.root, release, blobs)
        assert 'vendor/formula-wheels/tools/authoring/add-output-speech.cjs' in changes
        apply(self.root, changes)
        validate(self.root)
        path = self.root/'vendor/formula-wheels/tools/authoring/add-output-speech.cjs'
        self.assertTrue(path.is_file())
        path.write_text('tampered', encoding='utf8')
        with self.assertRaisesRegex(ValueError, 'modified'):
            validate(self.root)

    def test_corrupt_archive_digest(self):
        release, blobs = fixture(self.root)
        bad = dict(blobs)
        bad[f'formula-wheels-{release["tag_name"]}.zip'] += b'evil'
        with self.assertRaisesRegex(ValueError,'asset SHA-256'):
            inspect_release(release, bad)

    def test_corrupt_checksums(self):
        release, blobs = fixture(self.root)
        bad = dict(blobs)
        bad['SHA256SUMS.txt'] = (b'0'*64 + f'  formula-wheels-{release["tag_name"]}.zip\n'.encode())
        asset = next(a for a in release['assets'] if a['name']=='SHA256SUMS.txt')
        asset['digest'] = 'sha256:'+sha(bad['SHA256SUMS.txt'])
        with self.assertRaisesRegex(ValueError,'SHA256SUMS'):
            inspect_release(release, bad)

    def test_corrupt_metadata_relation(self):
        release, blobs = fixture(self.root)
        bad = dict(blobs)
        metadata = json.loads(bad['PUBLIC_VERSION.json'])
        metadata['canonicalRuntimeSHA256']['src/formula-wheels.js'] = '0'*64
        bad['PUBLIC_VERSION.json'] = json.dumps(metadata).encode()
        asset = next(a for a in release['assets'] if a['name']=='PUBLIC_VERSION.json')
        asset['digest'] = 'sha256:'+sha(bad['PUBLIC_VERSION.json'])
        with self.assertRaisesRegex(ValueError,'Official runtime differs'):
            inspect_release(release, bad)

    def test_missing_or_untrusted_release_asset(self):
        release, blobs = fixture(self.root)
        release['assets'][0]['browser_download_url'] = 'https://untrusted.example/file.zip'
        with self.assertRaisesRegex(ValueError,'Unexpected official asset URL'):
            inspect_release(release, blobs)
        release, blobs = fixture(self.root)
        release['assets'].pop()
        with self.assertRaisesRegex(ValueError,'assets missing'):
            inspect_release(release, blobs)

    def test_user_changes_refused(self):
        (self.root/'vendor/formula-wheels/src/formula-wheels.js').write_bytes(b'changed')
        release, blobs = fixture(PROJECT)
        with self.assertRaises(ValueError): plan(self.root, release, blobs)

    def test_pins_detect_modified_assets(self):
        (self.root/'assets/css/formula-wheels.css').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError,'modified'):
            validate(self.root)


if __name__ == '__main__':
    unittest.main(verbosity=2)
