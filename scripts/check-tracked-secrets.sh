#!/usr/bin/env bash
# check-tracked-secrets.sh: fail when a key, certificate, env file or agent-log folder is tracked.
#
# Usage:  bash scripts/check-tracked-secrets.sh
#
# This repo is public. .gitignore keeps these out of a normal add; this check is the backstop for
# a forced add or an ignore rule that changes. deploy.yml runs it before the build. Matched paths:
#   .env and .env.* at any depth (an .env.example template is allowed)
#   *.p8, *.pem, *.p12
#   anything under a secrets/ or AI-Memory/ folder
# It also fails when a tracked file's content holds an absolute macOS home path (/Users/...),
# which leaks the local username and folder layout. This script is excluded from that grep.
# It reads the index (git ls-files, git grep --cached), so it works in a sparse checkout.
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

hits=$(git ls-files -z | tr '\0' '\n' | grep -E '(^|/)\.env($|\.)|\.(p8|pem|p12)$|(^|/)(secrets|AI-Memory)/' | grep -vE '(^|/)\.env\.example$' || true)
if [ -n "$hits" ]; then
  echo "::error::tracked files that must never be in this public repo:"
  printf '%s\n' "$hits"
  echo "Remove them with 'git rm --cached <path>', then revoke or rotate anything they held."
  exit 1
fi
paths=$(git grep --cached -n -I -e '/Users/' -- . ':(exclude)scripts/check-tracked-secrets.sh' || true)
if [ -n "$paths" ]; then
  echo "::error::tracked files contain an absolute /Users/ path (local username and layout):"
  printf '%s\n' "$paths"
  echo "Make the path relative to the repo, or describe it without the home folder."
  exit 1
fi
echo "check-tracked-secrets: no key, env or agent-log files tracked, and no /Users/ paths."
