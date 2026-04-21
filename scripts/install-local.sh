#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required but was not found in PATH."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but was not found in PATH."
  exit 1
fi

cd "${ROOT_DIR}"

echo "Installing dependencies..."
bun install --frozen-lockfile

echo "Building TypeScript tooling outputs..."
bun run tools:build

echo "Installing @ailib/cli globally from local repository..."
npm install -g .

echo "Validating installed CLI..."
ailib --help >/dev/null

echo "Local install complete."
echo "Try: ailib --help"
