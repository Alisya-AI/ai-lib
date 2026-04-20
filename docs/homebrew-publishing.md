# Publishing `ailib` to Homebrew

This project supports two Homebrew distribution paths.

## Path 1 (recommended now): dedicated tap (`Alisya-AI/homebrew-ailib`)

Use this path to provide `brew install ailib` after users tap once.

### 1) Create the tap repository

- Create GitHub repository: `Alisya-AI/homebrew-ailib`
- Add file: `Formula/ailib.rb`
- Copy the formula from this repository as your starting point.

### 2) Switch the tap formula to stable releases

Use immutable source artifacts (tag tarballs) instead of HEAD-only installs.

Example stable formula shape:

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

### 3) Release workflow per version

For each new version:

1. Create and push tag in `Alisya-AI/ai-lib` (for example `v1.0.1`).
2. Download the tag tarball and compute SHA256:
   ```bash
   curl -L -o /tmp/ailib-v1.0.1.tar.gz https://github.com/Alisya-AI/ai-lib/archive/refs/tags/v1.0.1.tar.gz
   shasum -a 256 /tmp/ailib-v1.0.1.tar.gz
   ```
3. Update tap `Formula/ailib.rb` with new `url` and `sha256`.
4. Commit and push in `Alisya-AI/homebrew-ailib`.

### 4) User install command

```bash
brew tap Alisya-AI/ailib
brew install ailib
```

Equivalent explicit form:

```bash
brew install Alisya-AI/ailib/ailib
```

## Path 2: Homebrew Core (`brew install ailib` globally, no tap)

To remove the tap requirement:

1. Ensure formula is stable (`url` + `sha256`, no mutable-only HEAD dependence).
2. Run local checks:
   ```bash
   brew audit --new-formula --strict Formula/ailib.rb
   brew test Formula/ailib.rb
   ```
3. Submit formula PR to `Homebrew/homebrew-core`.
4. After merge, users can run:
   ```bash
   brew install ailib
   ```

Homebrew Core acceptance depends on its review standards (quality, maintenance, and ecosystem fit).
