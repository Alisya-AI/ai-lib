class Ailib < Formula
  desc "Universal AI context-injection engine CLI"
  homepage "https://github.com/Alisya-AI/ai-lib"
  url "https://registry.npmjs.org/@alisya.ai/ailib/-/ailib-1.0.10.tgz"
  sha256 "460b57e19fc0e3043ab8f0fe1641263402886d7ca858216942b99cf8b37ab910"
  version "1.0.10"
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
