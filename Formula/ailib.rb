class Ailib < Formula
  desc "Universal AI context-injection engine CLI"
  homepage "https://github.com/Alisya-AI/ai-lib"
  url "https://registry.npmjs.org/@alisya.ai/ailib/-/ailib-1.0.22.tgz"
  sha256 "92da43d86940acb5e245c8a2bc4a06a15a3e019bbfd8997ad12049868ae81bab"
  version "1.0.22"
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
