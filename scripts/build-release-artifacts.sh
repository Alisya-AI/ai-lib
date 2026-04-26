#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist/release"
RUN_CHECKS="true"

for arg in "$@"; do
  case "$arg" in
    --skip-check)
      RUN_CHECKS="false"
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: bash scripts/build-release-artifacts.sh [--skip-check]"
      exit 1
      ;;
  esac
done

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

if [[ "${RUN_CHECKS}" == "true" ]]; then
  echo "Running full checks..."
  bun run check
fi

echo "Building TypeScript tooling outputs..."
bun run tools:build

mkdir -p "${DIST_DIR}"
rm -f "${DIST_DIR}"/*.tgz "${DIST_DIR}"/release-checksums.txt "${DIST_DIR}"/homebrew-formula-snippet.txt

echo "Packing npm artifact..."
PACK_JSON="$(npm pack --pack-destination "${DIST_DIR}" --json)"
NPM_TARBALL="$(printf '%s' "${PACK_JSON}" | node -e "let input='';process.stdin.on('data',d=>input+=d);process.stdin.on('end',()=>{const parsed=JSON.parse(input);console.log(parsed[0].filename);});")"
NPM_TARBALL_PATH="${DIST_DIR}/${NPM_TARBALL}"

VERSION="$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('package.json','utf8')).version)")"
PACKAGE_NAME="$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('package.json','utf8')).name)")"
PACKAGE_BASENAME="$(node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')).name;process.stdout.write(p.split('/').pop())")"
GIT_SHA="$(git rev-parse --short HEAD)"
SOURCE_TARBALL="ailib-v${VERSION}-${GIT_SHA}-source.tar.gz"
SOURCE_TARBALL_PATH="${DIST_DIR}/${SOURCE_TARBALL}"
NPM_REGISTRY_TARBALL_URL="https://registry.npmjs.org/${PACKAGE_NAME}/-/${PACKAGE_BASENAME}-${VERSION}.tgz"

echo "Packing source artifact for formula workflows..."
git archive --format=tar.gz --output="${SOURCE_TARBALL_PATH}" HEAD

NPM_SHA="$(shasum -a 256 "${NPM_TARBALL_PATH}" | awk '{print $1}')"
SOURCE_SHA="$(shasum -a 256 "${SOURCE_TARBALL_PATH}" | awk '{print $1}')"
NPM_REGISTRY_SHA=""
NPM_REGISTRY_TARBALL_PATH="${DIST_DIR}/npm-registry-${PACKAGE_BASENAME}-${VERSION}.tgz"

if command -v curl >/dev/null 2>&1 && curl -fsSL "${NPM_REGISTRY_TARBALL_URL}" -o "${NPM_REGISTRY_TARBALL_PATH}"; then
  NPM_REGISTRY_SHA="$(shasum -a 256 "${NPM_REGISTRY_TARBALL_PATH}" | awk '{print $1}')"
  rm -f "${NPM_REGISTRY_TARBALL_PATH}"
else
  rm -f "${NPM_REGISTRY_TARBALL_PATH}"
  echo "Published npm tarball not yet available for ${PACKAGE_NAME}@${VERSION}; using local npm pack checksum in formula snippet."
fi

FORMULA_SHA="${NPM_SHA}"
if [[ -n "${NPM_REGISTRY_SHA}" ]]; then
  FORMULA_SHA="${NPM_REGISTRY_SHA}"
fi

{
  echo "npm_tarball=${NPM_TARBALL}"
  echo "npm_tarball_url=${NPM_REGISTRY_TARBALL_URL}"
  echo "npm_sha256_local=${NPM_SHA}"
  echo "npm_sha256_published=${NPM_REGISTRY_SHA}"
  echo "npm_sha256=${FORMULA_SHA}"
  echo "source_tarball=${SOURCE_TARBALL}"
  echo "source_sha256=${SOURCE_SHA}"
  echo "version=${VERSION}"
  echo "git_sha=${GIT_SHA}"
} > "${DIST_DIR}/release-checksums.txt"

{
  echo "url \"${NPM_REGISTRY_TARBALL_URL}\""
  echo "sha256 \"${FORMULA_SHA}\""
  echo "version \"${VERSION}\""
} > "${DIST_DIR}/homebrew-formula-snippet.txt"

echo "Release artifacts generated:"
echo "- ${NPM_TARBALL_PATH}"
echo "- ${SOURCE_TARBALL_PATH}"
echo "- ${DIST_DIR}/release-checksums.txt"
echo "- ${DIST_DIR}/homebrew-formula-snippet.txt"
