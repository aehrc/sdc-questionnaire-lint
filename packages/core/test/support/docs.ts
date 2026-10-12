import { readFileSync } from 'node:fs';
import { docsDir } from './report.js';

// The fenced blocks in one language under a heading of docs/cli.md, up to the next heading of the
// same or a higher level, in order. The docs examples are the spec the formatters are tested
// against. A # line inside a fence, such as a Markdown example, is not a heading.
export function cliExamples(heading: string, language: string): string[] {
  const lines = readFileSync(new URL('cli.md', docsDir), 'utf8')
    .replaceAll('\r\n', '\n')
    .split('\n');
  const start = lines.indexOf(heading);
  if (start === -1) throw new Error(`docs/cli.md has no heading ${heading}`);
  const level = heading.indexOf(' ');
  const blocks: string[] = [];
  let block: string[] | undefined;
  let fenced = false;
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('```')) {
      if (!fenced && line === `\`\`\`${language}`) block = [];
      else if (fenced && block !== undefined) {
        blocks.push(`${block.join('\n')}\n`);
        block = undefined;
      }
      fenced = !fenced;
    } else if (fenced) {
      block?.push(line);
    } else {
      const hashes = /^(#+) /.exec(line)?.[1]?.length;
      if (hashes !== undefined && hashes <= level) break;
    }
  }
  return blocks;
}
