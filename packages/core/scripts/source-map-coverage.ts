// Measures FSH source mapping on a real IG: locates every expression site of its compiled
// Questionnaires as a finding over the whole expression would be, and checks each mapped one.
// A development script, not shipped; run it after SUSHI has compiled the IG:
//   npm run source-map:coverage --workspace sdc-questionnaire-lint -- <IG directory>
// It exits 1 when fewer than 95% of sites map, or when any check fails.
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { ExpressionSite } from '../src/analysis/expression-site.js';
import { findExpressionSites } from '../src/analysis/expression-sites.js';
import { loadConfig } from '../src/config/load.js';
import { resolveRunPaths } from '../src/config/paths.js';
import { loadInputs } from '../src/inputs/load-inputs.js';
import type { ExpressionExcerpt, SourceLocation } from '../src/report/types.js';
import { findFshSources } from '../src/run/sources.js';
import { expressionLiterals, namesExtension } from '../src/source/expression-literals.js';
import { parseFshDocument, type FshDocument } from '../src/source/fsh-document.js';
import { fshFiles } from '../src/source/fsh-files.js';
import { decodeFshString } from '../src/source/fsh-string.js';
import { locateExpression } from '../src/source/locate.js';
import { readSushiIndex } from '../src/source/sushi-index.js';

const minimumMapped = 95;
const sampleSize = 20;

interface Anchored {
  location: SourceLocation;
  site: ExpressionSite;
  owner: ExpressionSite;
}

// As the rule runner shows a finding: a fragment within its whole query.
function excerptOf(site: ExpressionSite & { text: string }): ExpressionExcerpt {
  if (site.fragment === undefined) return { text: site.text };
  const { query, startOffset, endOffset } = site.fragment;
  return { text: query, range: { startOffset, endOffset } };
}

// A fixed-seed shuffle (mulberry32), so the sample is the same on every run.
function shuffled<T>(items: readonly T[], seed = 23): T[] {
  let state = seed;
  const random = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other] as T, result[index] as T];
  }
  return result;
}

async function main(igDirectory: string): Promise<number> {
  const cwd = await realpath(igDirectory);
  const runPaths = resolveRunPaths({ cwd, config: await loadConfig({ cwd }) });
  const { documents } = await loadInputs({ cwd, cliPaths: [], runPaths });
  const sources = await findFshSources(runPaths, cwd);
  const context = {
    index: await readSushiIndex(runPaths.sushiIndex),
    files: fshFiles(sources.directories),
    cwd,
  };
  const aliases = new Map(
    (await context.files.all()).flatMap(({ document }) => [...document.aliases]),
  );
  // FSH files as read from disk again, independently of the mapper's cache.
  const reread = new Map<string, FshDocument>();
  const fshAt = async (file: string): Promise<FshDocument> => {
    let document = reread.get(file);
    if (document === undefined) {
      document = parseFshDocument(await readFile(path.join(cwd, file), 'utf8'));
      reread.set(file, document);
    }
    return document;
  };

  const counts = new Map<string, number>();
  const failures: string[] = [];
  const anchored: Anchored[] = [];
  let total = 0;

  for (const { input, document } of documents) {
    const sites = findExpressionSites(document);
    for (const site of sites) {
      if (site.text === undefined) continue;
      total += 1;
      const expression = excerptOf({ ...site, text: site.text });
      const result = await locateExpression(
        { document: { input, document, sites }, site, expression },
        context,
      );
      const outcome = result.status === 'mapped' ? result.confidence : result.reason;
      counts.set(outcome, (counts.get(outcome) ?? 0) + 1);
      if (result.status === 'unmapped') continue;

      const where = `${input.display} ${site.pointer}`;
      const { location } = result;
      const fsh = await fshAt(location.file);
      const offset = (line: number, column: number): number =>
        (fsh.lineStarts[line - 1] ?? 0) + column - 1;
      const start = offset(location.line, location.column);

      // Self-check: the source under the range decodes to the expression it covers.
      const source = fsh.text.slice(start, offset(location.endLine, location.endColumn));
      const { startOffset = 0, endOffset = expression.text.length } = expression.range ?? {};
      if (decodeFshString(`"${source}"`)?.value !== expression.text.slice(startOffset, endOffset)) {
        failures.push(`self-check: ${where} maps to ${JSON.stringify(source)}`);
      }

      // The literal there must carry the expression's anchors.
      const owner =
        site.carrier === 'fragment'
          ? sites.find(
              (each) =>
                each.carrier !== 'fragment' && each.expressionPointer === site.expressionPointer,
            )
          : site;
      const literal = fsh.definitions
        .filter(({ keyword }) => keyword === 'Instance')
        .flatMap(expressionLiterals)
        .find((each) => each.offset < start && start < each.offset + each.literal.length);
      const url = owner?.location?.url;
      if (
        owner === undefined ||
        literal === undefined ||
        literal.linkId !== owner.item?.linkId ||
        literal.name !== owner.name ||
        (url !== undefined &&
          (literal.extension === undefined || !namesExtension(literal.extension, url, aliases)))
      ) {
        failures.push(`anchors: ${where} maps to ${location.file}:${String(location.line)}`);
      }
      if (result.confidence === 'anchored' && owner !== undefined) {
        anchored.push({ location, site, owner });
      }
    }
  }

  const mapped = (counts.get('exact') ?? 0) + (counts.get('anchored') ?? 0);
  const percent = total === 0 ? 0 : (100 * mapped) / total;
  console.log(`${String(documents.length)} Questionnaires, ${String(total)} expression sites.`);
  for (const [outcome, count] of [...counts].sort()) {
    console.log(`  ${outcome}: ${String(count)}`);
  }
  console.log(`Mapped: ${percent.toFixed(1)}%. Failed checks: ${String(failures.length)}.`);
  for (const failure of failures) console.log(`  ${failure}`);

  console.log(
    `\nAnchored sample to check by hand (${String(sampleSize)} of ${String(anchored.length)}):`,
  );
  for (const { location, site, owner } of shuffled(anchored).slice(0, sampleSize)) {
    const fsh = await fshAt(location.file);
    const line = fsh.text
      .slice(fsh.lineStarts[location.line - 1], fsh.lineStarts[location.line])
      .trim();
    console.log(`  ${location.file}:${String(location.line)}:${String(location.column)}`);
    console.log(`    FSH:  ${line}`);
    console.log(
      `    JSON: linkId ${owner.item?.linkId ?? '(none)'}, name ${owner.name ?? '(none)'}, ${site.pointer}`,
    );
  }
  return percent >= minimumMapped && failures.length === 0 ? 0 : 1;
}

const [igDirectory] = process.argv.slice(2);
if (igDirectory === undefined) {
  console.error('usage: npm run source-map:coverage --workspace sdc-questionnaire-lint -- <IG>');
  process.exitCode = 2;
} else {
  process.exitCode = await main(igDirectory);
}
