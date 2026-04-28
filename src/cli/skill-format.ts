export type SkillMarkdownTargetFormat = 'cursor' | 'claude-code';

export function convertSkillMarkdownFormat({
  source,
  targetFormat
}: {
  source: string;
  targetFormat: SkillMarkdownTargetFormat;
}) {
  if (targetFormat === 'cursor') {
    const mapped = source
      .replace(/^##\s+Purpose\s*$/gm, '## When to Use')
      .replace(/^##\s+Workflow\s*$/gm, '## Instructions');
    return ensureInstructionLeadParagraph(mapped);
  }
  const mapped = source
    .replace(/^##\s+When to Use\s*$/gm, '## Purpose')
    .replace(/^##\s+Instructions\s*$/gm, '## Workflow');
  return mapped.replace(/\nDetailed instructions for the agent\.\n+/m, '\n\n');
}

export function ensureInstructionLeadParagraph(content: string): string {
  if (!/^\s*##\s+Instructions\s*$/m.test(content)) return content;
  if (content.includes('Detailed instructions for the agent.')) return content;
  const headingMatch = content.match(/^(#\s+.+)$/m);
  if (!headingMatch) return content;

  const heading = headingMatch[1];
  const index = content.indexOf(heading);
  if (index < 0) return content;
  const before = content.slice(0, index + heading.length);
  const after = content.slice(index + heading.length).trimStart();
  return `${before}\n\nDetailed instructions for the agent.\n\n${after}`;
}
