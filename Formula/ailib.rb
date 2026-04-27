class Ailib < Formula
  desc "Universal AI context-injection engine CLI"
  homepage "https://github.com/Alisya-AI/ai-lib"
  url "https://registry.npmjs.org/@alisya.ai/ailib/-/ailib-1.0.12.tgz"
  sha256 "e29549b951370e185842a1b7b71d9501ad6867ae3058f0d42c9272cb59e30f77"
  version "1.0.12"
  head "https://github.com/Alisya-AI/ai-lib.git", branch: "main"
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
