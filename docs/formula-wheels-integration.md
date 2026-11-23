# Formula Wheels integration in *College Algebra from Here* (22.1-B candidate)

This is a textbook-specific integration for Forest Fisher's PreTeXt 2.56.2 book, **not** a change to the approved Formula Wheels v1.0.0 runtime. Formula Wheels is copyright © 2026 Forest Fisher, licensed under MPL 2.0, and was vibe coded with extensive ChatGPT (OpenAI) assistance. License and attribution files accompany the vendored source.

## Version pin and file ownership

The `formula-wheels.lock.json` file records the exact approved public upstream release `v1.0.0`, original ZIP SHA-256, and file-level SHA-256 hashes. `vendor/formula-wheels/` contains approved upstream code including the ORIGINAL gallery patcher. `assets/code/formula-wheels.js` and `assets/css/formula-wheels.css` are byte-identical mirrors used by PreTeXt.

`scripts/fw_postbuild.py` is **new integration glue**, in the textbook, developed during milestone 22.1-B. It imports and reuses the original patcher's two validated HTML transformation helpers, but scans the textbook's `source/` rather than the gallery's `source/`, and loads scheduler/accessibility code from `vendor/formula-wheels/src/`. No engine, stylesheet, scheduler or child MathJax configuration was rewritten. This portable glue is not falsely represented as part of the already approved v1.0.0 archive.

## Authoring

When creating a Formula Wheels exercise, use an explicit unique `xml:id`, and list `code/formula-wheels.js` before the exercise's own author script in `<interactive source="...">`. Also list `css/formula-wheels.css` in `css="..."`. Keep your author scripts in `assets/code/` and per-exercise styles in `assets/css/`. See upstream [`docs/API.md`](https://github.com/forest-fisher/formula-wheels/blob/v1.0.0/docs/API.md) for the precise wheel and accessibleMathLatex API.

The current textbook has **no Formula Wheels interactives**, so post-processing deliberately does nothing until the first one is introduced. Its other JSXGraph interactives and ordinary content are unaffected.

## Build / preview in Codespaces

Use **instead of raw `pretext build web`**:

```bash
python scripts/fw_build.py web
pretext view web
```

The wrapper verifies pinned code, runs PreTeXt 2.56.2, then patches the generated HTML with the accepted parent iframe scheduler and child MathJax accessibility configuration. Existing PreTeXt's editor Build button, or running `pretext build web` alone, bypasses this post-build step; do not use those to publish pages containing Formula Wheels until a supported PreTeXt hook has been tested. It is safe to use them on regular textbook content when no Formula Wheels are present, but the result is not a fully integrated Formula Wheels build.

To build deployable targets, run `python scripts/fw_build.py --deploys`, then `pretext deploy --stage-only` (or existing deployment workflow). **The two existing GitHub Actions workflows are updated to invoke the wrapper automatically** so published or reviewed builds don't silently miss the patch.

Backups of generated unpatched parent/child HTML live in `output/.formula-wheels-unpatched/web/`, intentionally outside the publishable `output/web/` folder. Rebuild with PreTeXt before repatching. After a fresh build, obsolete out-of-tree backups are automatically replaced; repatching an already-patched HTML page remains an error. The original diagnostic `FW_RC1_...` strings are historical approved identifiers and remain unchanged.

## Tests and acceptance scope

```bash
python scripts/fw_verify.py
python tests/formula-wheels/test_external_integration.py
python tests/formula-wheels/test_pretext_smoke.py
python scripts/fw_build.py web
```

- `fw_verify.py`: compares pinned vendored runtime, parent/child hooks and mirrored assets with the committed lockfile.
- `test_external_integration.py`: synthetic multi-parent/child HTML tests for isolation, fail-closed behavior, backups and no-interactive no-op.
- `test_pretext_smoke.py`: builds a **separate tiny PreTeXt 2.56.2 book**, using the common `project.ptx` and Denver-style structure, then patches three generated Formula Wheels iframes (including a JSXGraph-linked example). This does NOT inject trial exercises into your book's XML.
- `fw_build.py web`: verifies and builds the **actual textbook** and applies the shim if any Formula Wheels are present. When no wheels are authored, it reports a no-op.

These checks do not replace physical-phone or skilled screen-reader evaluation, do not prove interactive browser functionality, and do not establish compatibility with every PreTeXt publication style. This milestone does not add the 22.1-C weekly update PR workflow.

## Rollback

Before committing: `git status --short` to inspect changes; use Git to discard the specific newly installed files and the two workflow edits. After committing: revert the integration commit. Do not delete unrelated textbook source or custom assets. `output/` is generated and ignored by Git.
