# Homebrew publishing for `ailib`

This document explains exactly how to publish and update `ailib` for Homebrew users.

## Current state

- In this repo, `Formula/ailib.rb` is a HEAD formula.
- Users can install directly from this repo:

```bash
brew install --HEAD --formula https://raw.githubusercontent.com/Alisya-AI/ai-lib/main/Formula/ailib.rb
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
- checksum manifest (`release-checksums.txt`)
- formula snippet helper (`homebrew-formula-snippet.txt`)

For a quicker local run that skips full checks:

```bash
bun run release:build -- --skip-check
```

Use a tap repo so users can run `brew install ailib` after one-time tap setup.

### One-time setup

1. Create tap repository: `Alisya-AI/homebrew-ailib`.
2. Add `Formula/ailib.rb`.
3. Start from the formula in this repository, then make it a stable formula (`url` + `sha256`).

Stable formula shape:

```ruby
class Ailib < Formula
  desc "Universal AI context-injection engine CLI"
  homepage "https://github.com/Alisya-AI/ai-lib"
  url "https://github.com/Alisya-AI/ai-lib/archive/refs/tags/vX.Y.Z.tar.gz"
  sha256 "<REPLACE_WITH_SHA256>"
  license "Apache-2.0"

  depends_on "node"

  def install
    system "npm", "install", "--omit=dev", *std_npm_args
  end

  test do
    system bin/"ailib", "--help"
  end
end
```

### Release workflow (every version)

1. Tag and push a release in `Alisya-AI/ai-lib` (example: `v1.0.1`).
2. Compute tarball SHA256:
   ```bash
   curl -L -o /tmp/ailib-v1.0.1.tar.gz https://github.com/Alisya-AI/ai-lib/archive/refs/tags/v1.0.1.tar.gz
   shasum -a 256 /tmp/ailib-v1.0.1.tar.gz
   ```
3. Update tap formula `url` and `sha256`.
4. Commit and push to `Alisya-AI/homebrew-ailib`.

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
