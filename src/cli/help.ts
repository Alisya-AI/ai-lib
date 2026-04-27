export function printHelp() {
  process.stdout.write(
    'ailib commands:\n' +
      '  ailib init [--language=<lang>] [--targets=a,b] [--modules=m1,m2] [--workspaces=a/*,b/*] [--bare] [--no-inherit] [--on-conflict=overwrite|merge|skip|abort]\n' +
      '  ailib update [--workspace=<path>]\n' +
      '  ailib add <module> [--workspace=<path>]\n' +
      '  ailib remove <module> [--workspace=<path>]\n' +
      '  ailib doctor [--workspace=<path>]\n' +
      '  ailib uninstall [--all]\n' +
      '  ailib version\n' +
      '  ailib slots list\n' +
      '  ailib modules list [--language=<lang>]\n' +
      '  ailib modules explain <module> [--language=<lang>]\n' +
      '  ailib skills list\n' +
      '  ailib skills explain <skill-id>\n' +
      '  ailib skills add <skill-id> [--workspace=<path>] [--path=<path>] [--description=<text>] [--format=cursor|claude-code] [--force]\n' +
      '  ailib skills remove <skill-id> [--workspace=<path>] [--path=<path>]\n' +
      '  ailib skills init <skill-id> (alias of skills add)\n' +
      '  ailib skills validate [--workspace=<path>] [--path=<path>]\n' +
      '  aliases: --help/-h, --version/-v\n'
  );
}
