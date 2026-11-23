#!/usr/bin/env python3
# Copyright (c) 2026 Forest Fisher; MPL-2.0.
# Vibe coded with extensive ChatGPT (OpenAI) assistance.
"""Check the latest official *stable* Formula Wheels release and update vendored files.

This script writes only the lockfile and already-defined pinned Formula Wheels paths.
It does not commit, create PRs, merge, or deploy; GitHub Actions handles PR creation.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = 'forest-fisher/formula-wheels'
REPOSITORY_URL = f'https://github.com/{REPO}'
API_URL = f'https://api.github.com/repos/{REPO}/releases/latest'
RELEASE_URL_PREFIX = f'{REPOSITORY_URL}/releases/download/'
DIGEST_PATTERN = re.compile(r'[0-9a-f]{64}\Z')
VERSION_PATTERN = re.compile(r'v(\d+)\.(\d+)\.(\d+)\Z')
MAX_DOWNLOAD = 25 * 1024 * 1024
MAX_UNCOMPRESSED = 60 * 1024 * 1024
PINNED_SOURCE = (
    'src/formula-wheels.js', 'src/formula-wheels.css',
    'src/iframe-scheduler.js', 'src/child-mathjax-config.js',
    'tools/patch_pretext.py', 'LICENSE', 'NOTICE.md',
    'RELEASE_MANIFEST_SHA256.json',
)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def get_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers={
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'college-algebra-formula-wheels-updater',
        'X-GitHub-Api-Version': '2022-11-28',
    })
    with urllib.request.urlopen(request, timeout=50) as response:
        # Content-Length is advisory. Enforce actual bytes as well.
        length = response.headers.get('Content-Length')
        if length is not None and int(length) > MAX_DOWNLOAD:
            raise ValueError(f'Download exceeds {MAX_DOWNLOAD} bytes: {url}')
        data = response.read(MAX_DOWNLOAD + 1)
    if len(data) > MAX_DOWNLOAD:
        raise ValueError(f'Download exceeds {MAX_DOWNLOAD} bytes: {url}')
    return data


def stable_version(tag: str) -> tuple[int, int, int]:
    if not isinstance(tag, str):
        raise ValueError('Release tag is not text')
    match = VERSION_PATTERN.fullmatch(tag)
    if not match:
        raise ValueError(f'Not a stable semantic version: {tag!r}')
    return tuple(int(part) for part in match.groups())


def choose_release(current: str, release: dict) -> bool:
    if release.get('draft') or release.get('prerelease'):
        raise ValueError('GitHub latest release is not stable')
    latest = stable_version(release['tag_name'])
    return latest > stable_version('v' + current)


def official_assets(release: dict) -> dict[str, dict]:
    tag = release['tag_name']
    version = tag[1:]
    required = {f'formula-wheels-v{version}.zip', 'SHA256SUMS.txt', 'PUBLIC_VERSION.json'}
    assets = release['assets']
    found = {}
    for asset in assets:
        name = asset.get('name')
        if name not in required:
            continue
        if name in found or not asset.get('state') == 'uploaded':
            raise ValueError(f'Missing or duplicate valid release asset: {name}')
        url = asset.get('browser_download_url', '')
        expected_url = f'{RELEASE_URL_PREFIX}{tag}/{name}'
        if url != expected_url:
            raise ValueError(f'Unexpected official asset URL: {url}')
        digest = asset.get('digest', '')
        if not digest.startswith('sha256:') or not DIGEST_PATTERN.fullmatch(digest[7:]):
            raise ValueError(f'No valid GitHub SHA-256 digest for {name}')
        found[name] = asset
    if set(found) != required:
        raise ValueError(f'Official release assets missing: {sorted(required - set(found))}')
    return found


def inspect_release(release: dict, downloaded: dict[str, bytes]) -> tuple[dict[str, bytes], dict]:
    """Validate all byte and inventory relationships before planning any file writes."""
    tag = release['tag_name']
    version = tag[1:]
    stable_version(tag)
    assets = official_assets(release)
    expected = set(assets)
    if set(downloaded) != expected:
        raise ValueError('Download set differs from official release asset set')
    for name, info in assets.items():
        if sha(downloaded[name]) != info['digest'][7:]:
            raise ValueError(f'GitHub release asset SHA-256 mismatch: {name}')
    archive_name = f'formula-wheels-v{version}.zip'
    sums = downloaded['SHA256SUMS.txt'].decode('utf-8')
    checksums = {}
    for line in sums.splitlines():
        if not line.strip():
            continue
        match = re.fullmatch(r'([0-9a-f]{64})\s+\*?([A-Za-z0-9_.-]+)', line)
        if match is None or match[2] in checksums:
            raise ValueError('Malformed or duplicate SHA256SUMS.txt entry')
        checksums[match[2]] = match[1]
    if checksums.get(archive_name) != sha(downloaded[archive_name]):
        raise ValueError('ZIP does not match published SHA256SUMS.txt')
    # The official release currently lists only the ZIP in SHA256SUMS.txt.
    # PUBLIC_VERSION.json is separately authenticated with GitHub's asset digest.
    meta = json.loads(downloaded['PUBLIC_VERSION.json'])
    if (meta['publicVersion'] != version or meta['tag'] != tag or
            meta['releaseAsset'] != archive_name or
            meta['releaseAssetSHA256'] != sha(downloaded[archive_name])):
        raise ValueError('Release metadata does not match published stable version')
    with zipfile.ZipFile(io.BytesIO(downloaded[archive_name])) as archive:
        records = archive.infolist()
        names = [record.filename for record in records]
        if not names or len(names) != len(set(names)):
            raise ValueError('Official ZIP has duplicate or missing inventory')
        if any(record.is_dir() or record.flag_bits & 0x1 or
               record.file_size > MAX_UNCOMPRESSED or
               record.filename.startswith('/') or
               '\\' in record.filename or
               any(part in ('', '.', '..') for part in record.filename.split('/'))
               for record in records):
            raise ValueError('Official ZIP contains unsafe paths, directories, or encrypted files')
        if sum(record.file_size for record in records) > MAX_UNCOMPRESSED:
            raise ValueError('Official ZIP uncompressed size exceeds limit')
        if 'RELEASE_MANIFEST_SHA256.json' not in names:
            raise ValueError('Official archive release manifest is missing')
        manifest = json.loads(archive.read('RELEASE_MANIFEST_SHA256.json'))
        files = manifest['files']
        if (set(names) != set(files) | {'RELEASE_MANIFEST_SHA256.json'} or
                not set(PINNED_SOURCE).issubset(set(names))):
            raise ValueError('Official ZIP inventory does not match release manifest')
        for name, expected_hash in files.items():
            if not DIGEST_PATTERN.fullmatch(expected_hash) or sha(archive.read(name)) != expected_hash:
                raise ValueError(f'Official release file SHA-256 mismatch: {name}')
        canonical = meta['canonicalRuntimeSHA256']
        if set(canonical) != set(PINNED_SOURCE[:4]):
            raise ValueError('Unexpected official runtime inventory')
        for original in PINNED_SOURCE[:4]:
            if canonical[original] != files[original]:
                raise ValueError(f'Official runtime differs from metadata: {original}')
        updates = {f'vendor/formula-wheels/{original}': archive.read(original)
                   for original in PINNED_SOURCE}
    updates['vendor/formula-wheels/PUBLIC_VERSION.json'] = downloaded['PUBLIC_VERSION.json']
    updates['assets/code/formula-wheels.js'] = updates['vendor/formula-wheels/src/formula-wheels.js']
    updates['assets/css/formula-wheels.css'] = updates['vendor/formula-wheels/src/formula-wheels.css']
    return updates, meta


def plan(root: Path, release: dict, downloaded: dict[str, bytes]) -> dict[str, bytes]:
    """No mutations; validate existing pin + incoming stable asset inventory."""
    from fw_verify import REQUIRED_FILES, validate
    validate(root)
    lock = json.loads((root / 'formula-wheels.lock.json').read_text(encoding='utf-8'))
    if not choose_release(lock['version'], release):
        return {}
    updates, meta = inspect_release(release, downloaded)
    if set(updates) != REQUIRED_FILES:
        raise ValueError('Unexpected vendored file set in newly approved release')
    tag = release['tag_name']
    version = meta['publicVersion']
    updated_lock = dict(lock)
    updated_lock['version'] = version
    updated_lock['source'] = dict(lock['source'])
    updated_lock['source'].update({
        'repository': REPOSITORY_URL,
        'tag': tag,
        'asset': f'formula-wheels-v{version}.zip',
        'assetSHA256': sha(downloaded[f'formula-wheels-v{version}.zip']),
    })
    updated_lock['files'] = dict(sorted((path, sha(contents)) for path, contents in updates.items()))
    updates['formula-wheels.lock.json'] = (json.dumps(updated_lock, indent=2) + '\n').encode()
    return updates


def apply(root: Path, changes: dict[str, bytes]):
    if not changes:
        return
    # Local file backup and rollback on write failure; never mutate unknown paths.
    previous = {}
    try:
        for relative in changes:
            file = root / relative
            if not file.is_file():
                raise ValueError(f'Refusing update: expected installed path missing: {relative}')
            previous[file] = file.read_bytes()
        for relative, value in changes.items():
            (root / relative).write_bytes(value)
        from fw_verify import validate
        validate(root)
    except Exception:
        for path, original in previous.items():
            path.write_bytes(original)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Update local vendored assets (never commit or deploy)')
    parser.add_argument('--github-output', type=Path, help='Write updated/version outputs for GitHub Actions')
    args = parser.parse_args()
    from fw_verify import validate
    validate(ROOT)
    lock = json.loads((ROOT / 'formula-wheels.lock.json').read_text(encoding='utf-8'))
    release = json.loads(get_bytes(API_URL))
    updated = choose_release(lock['version'], release)
    tag = release['tag_name']
    if not updated:
        print(f'UP TO DATE: Formula Wheels v{lock["version"]}; latest stable is {tag}.')
    elif not args.apply:
        print(f'UPDATE AVAILABLE: Formula Wheels v{lock["version"]} -> {tag}; no files changed.')
    else:
        assets = official_assets(release)
        download = {name: get_bytes(info['browser_download_url']) for name, info in assets.items()}
        changes = plan(ROOT, release, download)
        apply(ROOT, changes)
        print(f'UPDATE PREPARED: Formula Wheels v{lock["version"]} -> {tag}; review and test before merging.')
    if args.github_output:
        with args.github_output.open('a', encoding='utf-8') as out:
            out.write(f'updated={str(updated and args.apply).lower()}\n')
            out.write(f'version={tag[1:]}\n')
            out.write(f'previous_version={lock["version"]}\n')

if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError, zipfile.BadZipFile) as exc:
        sys.exit('FORMULA WHEELS UPDATE ERROR: ' + str(exc))
