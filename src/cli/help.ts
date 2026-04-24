export function printHelp() {
  process.stdout.write(
    'ailib commands:\n' +
      '  ailib init [--language=<lang>] [--targets=a,b] [--modules=m1,m2] [--workspaces=a/*,b/*] [--bare] [--no-inherit] [--on-conflict=overwrite|merge|skip|abort]\n' +
      '  ailib update [--workspace=<path>]\n' +
      '  ailib add <module> [--workspace=<path>]\n' +
      '  ailib remove <module> [--workspace=<path>]\n' +
      '  ailib doctor [--workspace=<path>]\n' +
      '  ailib uninstall [--all]\n' +
      '  ailib slots list\n' +
      '  ailib modules list [--language=<lang>]\n' +
      '  ailib modules explain <module> [--language=<lang>]\n' +
      '  ailib skills init <skill-id> [--workspace=<path>] [--path=<path>] [--description=<text>] [--force]\n' +
      '  ailib skills validate [--workspace=<path>] [--path=<path>]\n'
  );
}
