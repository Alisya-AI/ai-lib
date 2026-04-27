class Ailib < Formula
  desc "Universal AI context-injection engine CLI"
  homepage "https://github.com/Alisya-AI/ai-lib"
  url "https://registry.npmjs.org/@alisya.ai/ailib/-/ailib-1.0.11.tgz"
  sha256 "4cd16c42ce1bd5a07f333cc560bdf56993d42770ff482f176e2f67ec9643ff84"
  version "1.0.11"
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
