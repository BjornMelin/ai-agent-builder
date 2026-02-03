#!/usr/bin/env bash
set -euo pipefail

# Fetches the AI Gateway model catalog into a JSON file.
# AI Gateway OpenAI-compatible base URL: https://ai-gateway.vercel.sh/v1
# Models endpoint: https://ai-gateway.vercel.sh/v1/models

RAW_BASE_URL="${AI_GATEWAY_BASE_URL:-https://ai-gateway.vercel.sh/v1}"
BASE_URL="${RAW_BASE_URL%/}"
if [[ "$BASE_URL" == */v3/ai ]]; then
  BASE_URL="${BASE_URL%/v3/ai}/v1"
elif [[ "$BASE_URL" == */v1/ai ]]; then
  BASE_URL="${BASE_URL%/ai}"
fi
OUT_FILE="${1:-docs/ai-gateway-models.json}"

if [[ -z "${AI_GATEWAY_API_KEY:-}" ]]; then
  echo "Error: AI_GATEWAY_API_KEY is required." >&2
  echo "Create one in the Vercel Dashboard → AI Gateway." >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT_FILE")"

curl -sS \
  -H "Authorization: Bearer ${AI_GATEWAY_API_KEY}" \
  -H "Accept: application/json" \
  "${BASE_URL}/models" \
  > "${OUT_FILE}"

echo "Wrote ${OUT_FILE}"
