#!/usr/bin/env nix-shell
#!nix-shell -i bash -p foundry jq

set -euo pipefail

CONTRACT_ADDRESS="0x5e982525d50046A813DBf55Ae72a3E00e99fbC94"
RPC_URL="${REMOTE_CONFIG_RPC:-https://ethereum-rpc.publicnode.com}"
OUTPUT_DIR="./config"
OUTPUT_PATH="${OUTPUT_DIR}/remote-config.json"
TMP_PATH=""

mkdir -p "$OUTPUT_DIR"
TMP_PATH="$(mktemp "${OUTPUT_PATH}.tmp.XXXXXX")"

cleanup() {
  if [ -n "$TMP_PATH" ] && [ -f "$TMP_PATH" ]; then
    rm -f "$TMP_PATH"
  fi
}

trap cleanup EXIT

raw="$(cast call "$CONTRACT_ADDRESS" "getConfig()(string)" --rpc-url "$RPC_URL")"

if [ -z "$raw" ]; then
  printf "Empty response from getConfig\n" >&2
  exit 1
fi

printf "%s\n" "$raw" | jq "fromjson" > "$TMP_PATH"

mv "$TMP_PATH" "$OUTPUT_PATH"
trap - EXIT

printf "Saved formatted remote config to %s\n" "$OUTPUT_PATH"
