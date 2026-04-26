# Homebrew publishing for `ailib`

This document explains exactly how to publish and update `ailib` for Homebrew users.

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

Use a tap repo so users can run `brew install ailib` after one-time tap setup.

### One-time setup

1. Create tap repository: `Alisya-AI/homebrew-ailib`.
2. Add `Formula/ailib.rb`.
3. Start from the formula in this repository and update `url`, `sha256`, and `version` each release.

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

### Release workflow (every version)

1. Publish npm version `X.Y.Z` for `@alisya.ai/ailib`.
2. Generate release artifacts:
   ```bash
   bun run release:build
   ```
3. Read `dist/release/homebrew-formula-snippet.txt` and copy values into tap `Formula/ailib.rb`.
   - If npm already has `@alisya.ai/ailib@X.Y.Z`, the snippet uses published tarball SHA256.
   - If not yet published, it falls back to local `npm pack` SHA256 (rerun after publish).
4. (optional verification) Compute npm tarball SHA256 directly:
   ```bash
   curl -L -o /tmp/ailib-X.Y.Z.tgz https://registry.npmjs.org/@alisya.ai/ailib/-/ailib-X.Y.Z.tgz
   shasum -a 256 /tmp/ailib-X.Y.Z.tgz
   ```
5. Commit and push to `Alisya-AI/homebrew-ailib`.

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
brew install ailib
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
