# Security model — public AYE build service

This is a public build-only repository. The AYE Captain implementation is maintained in a separate private GitLab repository.

## Credential rules

- Store a project-scoped GitLab token only in the GitHub Actions secret `GITLAB_READ_TOKEN`.
- Scopes: `read_api` and `read_repository` only. No `api`, `write_repository`, runner registration, merge or administrator permissions.
- No GitLab token is available to `pull_request` or push validation jobs. No `pull_request_target` is used.
- Checkout writes authentication temporarily to a mode-0600 `.netrc` under a temporary HOME; it is removed immediately after checkout. No credential-bearing remote URL.
- The AYE build, TypeScript compile, tests and artifact upload steps run **without** the GitLab secret.
- `actions/checkout` uses `persist-credentials: false`, and `GITHUB_TOKEN` is read-only.

## Admission and provenance

- Input must be a 40-character Git SHA from the private GitLab protected `main` history.
- The newest pipeline for the selected SHA on `main` must be successful. A running, failed, missing or unknown pipeline is a HOLD.
- A source checkout SHA mismatch fails the build. Both source and Node 26 runtime versions are recorded.
- Build on actual `linux/x64`, `linux/arm64`, and `darwin/arm64` runners.
- `npm ci --ignore-scripts` avoids dependency lifecycle scripts in this supply-chain step. This does not replace an independent dependency review.
- Binary smoke checks inspect the exact executable; verification errors fail the job.
- Only selected binary, manifest and sidecars are bundled. No Git internals, source directory or secrets in artifacts.

## Status limitations

Packages are **developer pilots**, not signed, attested or notarized production releases. An ad-hoc macOS signature is not a trusted Apple Developer ID signature. The GitLab source may contain configuration-sensitive behavior: publishing native binaries publicly is a deliberate release policy decision. Review artifact contents and threat model before enabling public distribution.

If a credential is exposed: immediately revoke it in GitLab, delete affected build artifacts, rotate it and review affected job logs. Never commit secrets to this repository.
