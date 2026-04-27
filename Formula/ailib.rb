class Ailib < Formula
  desc "Universal AI context-injection engine CLI"
  homepage "https://github.com/Alisya-AI/ai-lib"
  url "https://registry.npmjs.org/@alisya.ai/ailib/-/ailib-1.0.13.tgz"
  sha256 "6860ef758f284ed664451e93376ce13e2406fd5f58930abe06bc0712faf0fa7e"
  version "1.0.13"
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
