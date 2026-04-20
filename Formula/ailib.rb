class Ailib < Formula
  desc "Universal AI context-injection engine CLI"
  homepage "https://github.com/Alisya-AI/ai-lib"
  head "https://github.com/Alisya-AI/ai-lib.git", branch: "main"
  license "Apache-2.0"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
  end

  test do
    system bin/"ailib", "--help"
    assert_match "ailib commands:", shell_output("#{bin}/ailib --help")
  end
end
