# Homebrew publishing for `ailib`

This document explains exactly how `ailib` Homebrew formulas are synchronized to npm releases.

## Current state

- In this repo, `Formula/ailib.rb` is a stable formula pinned to a published npm tarball (`url` + `sha256`).
- Users can install directly from this repo:

```bash
brew install --formula https://raw.githubusercontent.com/Alisya-AI/ai-lib/main/Formula/ailib.rb
```

## Recommended distribution: dedicated tap

## Build artifacts for npm and formula work

Generate release artifacts from the repository:

```bash
bun run release:build
```

Outputs are written to `dist/release/`:

- npm package tarball (`*.tgz`)
- source tarball (`ailib-v<version>-<sha>-source.tar.gz`)
- checksum manifest (`release-checksums.txt`) with local + published npm checksum fields
- formula snippet helper (`homebrew-formula-snippet.txt`)

To run npm release readiness checks (artifact + unpublished-version validation):

```bash
bun run release:npm:preflight
```

For a quicker local run that skips full checks:

```bash
bun run release:build -- --skip-check
```

Use a tap repo so users can install a stable named formula after one-time tap setup.

### One-time setup

1. Create tap repository: `Alisya-AI/homebrew-ailib`.
2. Add `Formula/ailib.rb`.
3. Add repository secret `HOMEBREW_TAP_TOKEN` in `Alisya-AI/ai-lib` with write access to `Alisya-AI/homebrew-ailib` (fine-grained PAT scoped to the tap repo is recommended).
4. Start from the formula in this repository.
5. Ensure `main` in `Alisya-AI/homebrew-ailib` accepts pushes from the token identity used by `HOMEBREW_TAP_TOKEN`.

Stable formula shape:

```ruby
class Ailib < Formula
  desc "Universal AI context-injection engine CLI"
  homepage "https://github.com/Alisya-AI/ai-lib"
  url "https://registry.npmjs.org/@alisya.ai/ailib/-/ailib-X.Y.Z.tgz"
  sha256 "<REPLACE_WITH_SHA256>"
  version "X.Y.Z"
  license "Apache-2.0"

  depends_on "node"

  def install
    system "npm", "install", "--omit=dev", *std_npm_args
    bin.write_exec_script libexec/"bin/ailib"
  end

  test do
    assert_match "ailib commands:", shell_output("#{bin}/ailib --help")
  end
end
```

### Release workflow (automated)

On each successful npm publish workflow run:

1. The release pipeline resolves the published tarball URL + SHA256 for `@alisya.ai/ailib@X.Y.Z`.
2. It updates `Formula/ailib.rb` in this repository and pushes the change to `main` when needed.
3. It clones `Alisya-AI/homebrew-ailib`, updates tap `Formula/ailib.rb`, commits the change, and pushes directly to `main`.

If `HOMEBREW_TAP_TOKEN` is missing, the release workflow fails so tap sync cannot drift silently.

### Optional verification

You can still verify a tarball checksum manually:

```bash
VERSION="X.Y.Z"
curl -L -o "/tmp/ailib-${VERSION}.tgz" "https://registry.npmjs.org/@alisya.ai/ailib/-/ailib-${VERSION}.tgz"
shasum -a 256 "/tmp/ailib-${VERSION}.tgz"
```

Legacy manual flow (fallback only):

1. Generate release artifacts:
   ```bash
   bun run release:build
   ```
2. Read `dist/release/homebrew-formula-snippet.txt` and copy values into tap `Formula/ailib.rb`.
3. Commit and push `Formula/ailib.rb` to `main` in `Alisya-AI/homebrew-ailib`.

Previous checksum verification command:

```bash
curl -L -o /tmp/ailib-X.Y.Z.tgz https://registry.npmjs.org/@alisya.ai/ailib/-/ailib-X.Y.Z.tgz
shasum -a 256 /tmp/ailib-X.Y.Z.tgz
```

## Release verification record (v1.0.2)

This section captures the concrete evidence for the first published tap release.

- Tap repo: `Alisya-AI/homebrew-ailib`
- Release PR: [homebrew-ailib#1](https://github.com/Alisya-AI/homebrew-ailib/pull/1)
- Merge commit: `18b1a058c11b16d5d5d733bd539eb874c2ed15a7`
- Formula package target: `@alisya.ai/ailib@1.0.2`
- Formula tarball URL: `https://registry.npmjs.org/@alisya.ai/ailib/-/ailib-1.0.2.tgz`
- Formula SHA256: `944c4617fdf801dd5f5d61e9e413579e508193a17320e71b37f60d3cda7da43c`

Verification commands used:

```bash
brew tap Alisya-AI/ailib
brew reinstall Alisya-AI/ailib/ailib
brew test Alisya-AI/ailib/ailib
ailib --help
```

Observed verification output:

```text
ailib commands:
  ailib init [--language=<lang>] [--targets=a,b] [--modules=m1,m2] ...
  ailib update [--workspace=<path>]
  ...
```

### User install commands

```bash
brew tap Alisya-AI/ailib
brew update
brew install Alisya-AI/ailib/ailib
```

Equivalent explicit form:

```bash
brew install Alisya-AI/ailib/ailib
```

## Optional path: Homebrew Core

If accepted into `Homebrew/homebrew-core`, users can install without tapping:

```bash
brew install ailib
```

Before submitting to Homebrew Core:

1. Ensure the formula uses immutable release artifacts (`url` + `sha256`).
2. Run:
   ```bash
   brew audit --new-formula --strict Formula/ailib.rb
   brew test Formula/ailib.rb
   ```
3. Open PR to `Homebrew/homebrew-core`.
