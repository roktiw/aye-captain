# AYE Captain — public native CLI builder

**Build-only repository.** The canonical AYE Captain source is maintained in the **private** GitLab project `roktiw/aye-captain`. This public GitHub repository contains build automation, tests and documentation only. It does **not** mirror the private application sources, homelab configuration, credentials or project inventory.

## Targets

| Artifact | Native GitHub runner | Architecture |
| --- | --- | --- |
| `aye-linux-x64-<sha>.tar.gz` | `ubuntu-24.04` | Linux x64 |
| `aye-linux-arm64-<sha>.tar.gz` | `ubuntu-24.04-arm` | Linux ARM64 |
| `aye-macos-arm64-<sha>.tar.gz` | `macos-15` | macOS Apple Silicon |

The pipeline uses **Node.js 26.13.1 SEA** (Single Executable Applications). It reuses the private GitLab application's existing `createSeaAssetPlan` and its exact source SHA; it does not introduce a second AYE CLI implementation. Each package contains the `aye` executable, integrity-checked Ansible sidecars, and a manifest. A SHA-256 checksum accompanies the archive. The binary runs `aye doctor --json` without an installed Node.js runtime. Other functions can require external tools (Git, Docker, SSH, Ansible) and explicit authorization.

**These are unsigned developer-pilot artifacts, not certified releases.** macOS binaries receive only ad-hoc signatures, not Apple Developer ID signing or notarization. There is no automatic deployment, host provisioning, release publication or automatic merge.

## One-time setup (repository maintainer)

1. In GitLab, create a **read-only** project access token scoped to `roktiw/aye-captain` with `read_repository` and `read_api`. Do not use a personal administrator token.
2. In this GitHub repository, open **Settings → Secrets and variables → Actions → New repository secret**. Set the name to **`GITLAB_READ_TOKEN`** and paste the GitLab token. Never put it in a file, issue, workflow input or chat.
3. Wait for the private GitLab `main` pipeline to finish with **success** on the commit to be built.
4. Open **Actions → Build AYE CLI → Run workflow**. Leave `gitlab_sha` empty to build the current protected `main`, or specify an exact 40-character SHA from that branch.

GitHub Actions first checks that the selected commit has a successful GitLab pipeline. Then each native runner checks out **that same exact SHA** using the read-only secret, removes checkout credentials, runs `npm ci --ignore-scripts`, creates the native SEA, and performs smoke/negative tests. Artifacts upload only from `release/`; the private source tree is never uploaded.

## Download and test

After a successful manual run, open its **Artifacts** and download the package for your OS and architecture. Verify its SHA-256 checksum before extraction, then run:

```sh
./aye --help
./aye doctor --json
```

Preserve the archive's relative directory layout: `aye` and `share/aye/bootstrap/ansible/` must remain together. Executing the binary does not authorize SSH access, provisioning or GitLab merges.

## Architecture and trust boundaries

- **GitLab (private):** authoritative TypeScript/Node 26 product source, source tests, release gate.
- **GitHub (public):** reproducible build recipe and ephemeral macOS/Linux build workers.
- **GitHub secret:** read-only GitLab token, scoped exclusively to source checkout and source revision verification.
- **Artifacts:** native executable and required generic sidecars only; no source checkout, `.git` directory or credentials.
- **Matrix:** native ARM and x64 runners, no emulation-based PASS.
- **No `pull_request_target`:** untrusted fork contributions cannot obtain private GitLab credentials.

Builder changes on pushes and PRs run syntax/unit checks. The binary build runs only through a **manual workflow_dispatch**. Future signed releases require explicit provenance, signing and notarization.

See [SECURITY.md](SECURITY.md) and [GitHub Actions](https://github.com/roktiw/aye-captain/actions/workflows/aye-cli.yml).
