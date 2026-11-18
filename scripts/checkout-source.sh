#!/usr/bin/env bash
# Private checkout for a trusted workflow_dispatch only; never used on pull_request.
set -Eeuo pipefail

if [[ -z "$GITLAB_READ_TOKEN" ]]; then
  echo 'GITLAB_READ_TOKEN_MISSING' >&2
  exit 2
fi
if [[ ! "$GITLAB_READ_TOKEN" =~ ^[A-Za-z0-9_-]{20,}$ ]]; then
  echo 'GITLAB_READ_TOKEN_FORMAT_INVALID' >&2
  exit 2
fi
if [[ ! "$AYE_SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]]; then
  echo 'SOURCE_SHA_INVALID' >&2
  exit 2
fi

dest=".private-gitlab-src"
if [[ -e "$dest" ]]; then
  echo 'SOURCE_DESTINATION_ALREADY_EXISTS' >&2
  exit 2
fi

private_home="$(mktemp -d)"
chmod 700 "$private_home"
cleanup() {
  rm -rf "$private_home"
}
trap cleanup EXIT
umask 077
printf 'machine gitlab.com login oauth2 password %s\n' "$GITLAB_READ_TOKEN" > "$private_home/.netrc"
chmod 600 "$private_home/.netrc"

# Do not put secrets in command arguments, clone URLs, Git config or stdout.
HOME="$private_home" GIT_TERMINAL_PROMPT=0 git -c credential.helper= clone \
  --quiet --filter=blob:none --single-branch --branch main --no-checkout \
  https://gitlab.com/roktiw/aye-captain.git "$dest"

if ! git -C "$dest" merge-base --is-ancestor "$AYE_SOURCE_SHA" refs/remotes/origin/main; then
  echo 'SOURCE_SHA_NOT_ON_MAIN' >&2
  exit 2
fi

HOME="$private_home" GIT_TERMINAL_PROMPT=0 git -C "$dest" checkout \
  --quiet --detach "$AYE_SOURCE_SHA"
actual="$(git -C "$dest" rev-parse HEAD)"
if [[ "$actual" != "$AYE_SOURCE_SHA" ]]; then
  echo 'SOURCE_SHA_MISMATCH' >&2
  exit 2
fi
echo "GitLab source checked out at $actual"
