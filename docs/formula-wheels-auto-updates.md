# Formula Wheels 22.1-C — Codespaces installer

This is a **local upgrade of the existing 22.1-B textbook integration**. It does not change the approved v1.0.0 runtime. The only existing file it replaces is `scripts/fw_verify.py`, making pin checks version-independent.

Current official GitHub release at packaging time (2026-11-23): **v1.0.0**. No runtime upgrade will occur until a newer stable release is published.

## 1. Upload this ZIP to the root of `college-algebra-from-here` in Codespaces

In Explorer, right-click `college-algebra-from-here`, select **Upload...**, and choose this ZIP. Then run from a Codespaces terminal:

```sh
cd /workspaces/college-algebra-from-here
unzip formula_wheels_22_1C_codespaces_install.zip -d /workspaces/
python /workspaces/fw221c_installer/install_into_book.py . --dry-run
python /workspaces/fw221c_installer/install_into_book.py .
```

## 2. Validate and inspect

```sh
python scripts/fw_verify.py
python tests/formula-wheels/test_auto_update.py
python scripts/fw_update_check.py  # Check the latest stable release without changing files
python tests/formula-wheels/test_external_integration.py
python tests/formula-wheels/test_pretext_smoke.py
python scripts/fw_build.py web

git status --short
git diff
```

If the check says **UP TO DATE**, that's correct while v1.0.0 is the latest stable release.

Once satisfied, delete `formula_wheels_22_1C_codespaces_install.zip` from the textbook root, then commit and sync the updated textbook through Codespaces. The extracted installer in `/workspaces/fw221c_installer` is outside the repo.

## 3. Enable PR creation in GitHub

In the textbook repository's **Settings → Actions → General → Workflow permissions**, enable **Allow GitHub Actions to create and approve pull requests** (if available), and save. The workflow itself requests `contents: write` and `pull-requests: write` permissions; without the repository setting, GitHub may reject PR creation.

## 4. Try a manual update check

Open the textbook repository on GitHub → **Actions** → **Check Formula Wheels stable release** → **Run workflow**. If there is no newer release, it succeeds without creating a pull request. On a future stable release, it verifies and tests changes before opening a PR.

## Important operational details

- The updater considers only GitHub's `/releases/latest` stable release, rejecting draft or prerelease metadata and non-semver tags.
- It refuses downgrades; it doesn't silently change any source content or PreTeXt configuration.
- It fails rather than updating if the upstream release archive and manifests are inconsistent.
- The scheduled check is Mondays at 13:17 UTC. GitHub schedules can be delayed.
- Review the library's changelog, API compatibility, and CI results **before merging** the automatically created PR.
- The public 1.0.0 runtime is unchanged by this installation. Automatic updates can change the runtime only through a reviewed PR.
