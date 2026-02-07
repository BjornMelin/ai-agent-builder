#!/usr/bin/env bash
set -euo pipefail

author_login="${VERCEL_GIT_COMMIT_AUTHOR_LOGIN:-}"
commit_ref="${VERCEL_GIT_COMMIT_REF:-}"

if [ "${author_login}" = "dependabot[bot]" ] || [ "${author_login}" = "renovate[bot]" ]; then
  echo "Ignoring build: bot author '${author_login}'."
  exit 0
fi

case "${commit_ref}" in
  dependabot/*|renovate/*)
    echo "Ignoring build: bot branch '${commit_ref}'."
    exit 0
    ;;
esac

echo "Build allowed: author='${author_login:-unknown}' branch='${commit_ref:-unknown}'."
exit 1
