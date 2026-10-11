// Generates a SUSHI project from a YAML config, compiles it with SUSHI, lints it and checks the
// findings against the config's expect entries, so a rule can be tried on real FSH. Only the
// configs are committed; the project goes to the gitignored demo/ folder. Run from the repository
// root, with SUSHI 3.20.1 on the PATH:
//   npm run demo                                    scripts/demo/invalid-demo.yaml into demo/invalid-demo
//   npm run demo -- path/to/config.yaml             another config, into demo/<instance>
//   npm run demo -- path/to/config.yaml --out dir   another output folder
//
// Quote every whole expression: "%a", "1", "'text'". Unquoted, %a is invalid YAML and 1 is a
// number, and 'text' alone is YAML quoting, so the FHIRPath string literal becomes a path.
//
// Config:    { instance, status?, extensions?, fsh?, items? }
// Item:      { linkId, type, text?, extensions?, fsh?, items?, expect? }
// Extension: { url, name?, language?, expression | reference, expect? }
// - url is an alias (see extensionUrls) or a full URL, written as is.
// - language defaults to text/fhirpath.
// - fsh holds raw FSH lines for anything else (launchContext, answerOption, enableWhen…), written
//   after the extensions of the same level, below its path: "required = true" on an item becomes
//   "* item[=].required = true".
// - expect lists the rule IDs a case should fire, one entry per finding. The check compares all of
//   them with the reported rule IDs, not locations; the printed report shows where each one mapped.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parse } from 'yaml';
import type { Report } from '../src/index.js';

export interface FshExtension {
  url: string;
  name?: string;
  language?: string;
  expression?: string;
  reference?: string;
  expect?: string[];
}

export interface FshItem {
  linkId: string;
  type: string;
  text?: string;
  extensions?: FshExtension[];
  fsh?: string[];
  items?: FshItem[];
  expect?: string[];
}

export interface FshConfig {
  instance: string;
  status?: string;
  extensions?: FshExtension[];
  fsh?: string[];
  items?: FshItem[];
}

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
const extensionUrls: ReadonlyMap<string, string> = new Map([
  ['variable', 'http://hl7.org/fhir/StructureDefinition/variable'],
  ...[
    'calculatedExpression',
    'enableWhenExpression',
    'initialExpression',
    'answerExpression',
    'candidateExpression',
    'contextExpression',
    'itemPopulationContext',
  ].map((alias): [string, string] => [alias, `${sdc}${alias}`]),
]);

const fshString = (value: string): string =>
  `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

// A list of one extension has no index. A longer one starts each entry with [0] or [+] and refers
// back to it with [=] on the entry's other lines.
function extensionLines(prefix: string, extensions: readonly FshExtension[]): string[] {
  return extensions.flatMap((extension, index) => {
    const { url, name, language = 'text/fhirpath', expression, reference = '' } = extension;
    const fields = [
      `url = ${fshString(extensionUrls.get(url) ?? url)}`,
      ...(name === undefined ? [] : [`valueExpression.name = ${fshString(name)}`]),
      `valueExpression.language = #${language}`,
      expression === undefined
        ? `valueExpression.reference = ${fshString(reference)}`
        : `valueExpression.expression = ${fshString(expression)}`,
    ];
    return fields.map((field, line) => {
      const at = extensions.length === 1 ? '' : line > 0 ? '[=]' : index === 0 ? '[0]' : '[+]';
      return `* ${prefix}extension${at}.${field}`;
    });
  });
}

function itemLines(prefix: string, items: readonly FshItem[]): string[] {
  return items.flatMap((item, index) => {
    const at = `${prefix}item[=].`;
    return [
      `* ${prefix}item${index === 0 ? '[0]' : '[+]'}.linkId = ${fshString(item.linkId)}`,
      `* ${at}type = #${item.type}`,
      ...(item.text === undefined ? [] : [`* ${at}text = ${fshString(item.text)}`]),
      ...extensionLines(at, item.extensions ?? []),
      ...(item.fsh ?? []).map((line) => `* ${at}${line}`),
      ...itemLines(at, item.items ?? []),
    ];
  });
}

export function renderFsh(config: FshConfig): string {
  return [
    `Instance: ${config.instance}`,
    'InstanceOf: Questionnaire',
    'Usage: #example',
    `* status = #${config.status ?? 'draft'}`,
    ...extensionLines('', config.extensions ?? []),
    ...(config.fsh ?? []).map((line) => `* ${line}`),
    ...itemLines('', config.items ?? []),
    '',
  ].join('\n');
}

type JsonObject = Record<string, unknown>;

const label = (at: string): string => (at === '' ? 'config' : at);
const child = (at: string, key: string): string => (at === '' ? key : `${at}.${key}`);

function object(value: unknown, at: string, keys: readonly string[]): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label(at)}: expected an object`);
  }
  const unknown = Object.keys(value).find((key) => !keys.includes(key));
  if (unknown !== undefined) {
    throw new Error(`${label(at)}: unknown key ${unknown}; expected one of ${keys.join(', ')}`);
  }
  return value as JsonObject;
}

function checkStrings(json: JsonObject, at: string, required: string[], optional: string[]): void {
  for (const key of required) {
    if (json[key] === undefined) throw new Error(`${label(at)}: ${key} is required`);
  }
  for (const key of [...required, ...optional]) {
    if (json[key] !== undefined && typeof json[key] !== 'string') {
      throw new Error(`${label(at)}: ${key} must be a string`);
    }
  }
}

// The array at json[key], or [] when the key is absent.
function list(json: JsonObject, at: string, key: string): unknown[] {
  const value = json[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label(at)}: ${key} must be an array`);
  return value;
}

function checkLines(json: JsonObject, at: string, key: string): void {
  if (list(json, at, key).some((line) => typeof line !== 'string')) {
    throw new Error(`${label(at)}: ${key} must be an array of strings`);
  }
}

function checkExtensions(json: JsonObject, at: string): void {
  list(json, at, 'extensions').forEach((value, index) => {
    const where = child(at, `extensions[${String(index)}]`);
    const extension = object(value, where, [
      'url',
      'name',
      'language',
      'expression',
      'reference',
      'expect',
    ]);
    checkStrings(extension, where, ['url'], ['name', 'language', 'expression', 'reference']);
    checkLines(extension, where, 'expect');
    const url = extension.url as string;
    if (!extensionUrls.has(url) && !url.includes('://')) {
      throw new Error(
        `${where}: url ${url} is neither a full URL nor an alias (${[...extensionUrls.keys()].join(', ')})`,
      );
    }
    if ((extension.expression === undefined) === (extension.reference === undefined)) {
      throw new Error(`${where}: give exactly one of expression and reference`);
    }
  });
}

function checkItems(json: JsonObject, at: string): void {
  list(json, at, 'items').forEach((value, index) => {
    const where = child(at, `items[${String(index)}]`);
    const item = object(value, where, [
      'linkId',
      'type',
      'text',
      'extensions',
      'fsh',
      'items',
      'expect',
    ]);
    checkStrings(item, where, ['linkId', 'type'], ['text']);
    checkLines(item, where, 'fsh');
    checkLines(item, where, 'expect');
    checkExtensions(item, where);
    checkItems(item, where);
  });
}

// Checks a parsed config and returns it typed, or throws an Error naming the path in the config.
export function parseFshConfig(value: unknown): FshConfig {
  const config = object(value, '', ['instance', 'status', 'extensions', 'fsh', 'items']);
  checkStrings(config, '', ['instance'], ['status']);
  // The instance names the output folder and the FSH file.
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(config.instance as string)) {
    throw new Error('config: instance must be letters, digits and hyphens');
  }
  checkLines(config, '', 'fsh');
  checkExtensions(config, '');
  checkItems(config, '');
  return config as unknown as FshConfig;
}

export function readFshConfig(file: string): FshConfig {
  let config: unknown;
  try {
    config = parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${file}: ${(error as Error).message}`, { cause: error });
  }
  return parseFshConfig(config);
}

export function renderSushiConfig(config: FshConfig): string {
  return [
    `canonical: http://example.org/${config.instance}`,
    'status: draft',
    'version: 0.1.0',
    'fhirVersion: 4.0.1',
    'FSHOnly: true',
    'dependencies:',
    '  hl7.fhir.uv.sdc: 4.0.0',
    '',
  ].join('\n');
}

// Replaces only what the generator and SUSHI write, so a wrong --out cannot wipe other files.
export function generateProject(config: FshConfig, outDir: string): void {
  for (const generated of ['sushi-config.yaml', 'input', 'fsh-generated']) {
    rmSync(path.join(outDir, generated), { recursive: true, force: true });
  }
  mkdirSync(path.join(outDir, 'input', 'fsh'), { recursive: true });
  writeFileSync(path.join(outDir, 'sushi-config.yaml'), renderSushiConfig(config));
  writeFileSync(path.join(outDir, 'input', 'fsh', `${config.instance}.fsh`), renderFsh(config));
}

// Every expect entry of the config, nested items included.
export function expectedRules(config: FshConfig): string[] {
  const fromExtensions = (extensions: readonly FshExtension[] = []): string[] =>
    extensions.flatMap((extension) => extension.expect ?? []);
  const fromItems = (items: readonly FshItem[] = []): string[] =>
    items.flatMap((item) => [
      ...(item.expect ?? []),
      ...fromExtensions(item.extensions),
      ...fromItems(item.items),
    ]);
  return [...fromExtensions(config.extensions), ...fromItems(config.items)];
}

// Rule IDs in one list and not the other, counting repeats.
export function compareRules(
  expected: readonly string[],
  reported: readonly string[],
): { missing: string[]; unexpected: string[] } {
  const unmatched = (from: readonly string[], against: readonly string[]): string[] => {
    const left = [...against];
    return from
      .filter((ruleId) => {
        const index = left.indexOf(ruleId);
        if (index === -1) return true;
        left.splice(index, 1);
        return false;
      })
      .sort();
  };
  return { missing: unmatched(expected, reported), unexpected: unmatched(reported, expected) };
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(2);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const example = fileURLToPath(new URL('example.ts', import.meta.url));
  const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

  let config: FshConfig;
  let project: string;
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: { out: { type: 'string' } },
    });
    config = readFshConfig(
      positionals[0] ?? fileURLToPath(new URL('demo/invalid-demo.yaml', import.meta.url)),
    );
    project = path.resolve(values.out ?? path.join(repoRoot, 'demo', config.instance));
    generateProject(config, project);
  } catch (error) {
    fail((error as Error).message);
  }
  console.log(`Generated ${path.relative(process.cwd(), project) || '.'}`);

  // example.ts compiles the project with SUSHI and lints it; its errors go straight to stderr.
  const run = spawnSync(process.execPath, [example, project, '--format', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 256 * 1024 * 1024,
  });
  if (!run.stdout.startsWith('{')) fail('the lint run wrote no report');
  const report = JSON.parse(run.stdout) as Report;
  if (report.status === 'failed') {
    fail(`the lint run failed: ${report.failure.code}: ${report.failure.message}`);
  }

  // The text report, for where each finding mapped in the FSH.
  spawnSync(process.execPath, [cli, 'lint', '--show-info'], { cwd: project, stdio: 'inherit' });

  const expected = expectedRules(config);
  const { missing, unexpected } = compareRules(
    expected,
    report.findings.map((finding) => finding.ruleId),
  );
  for (const ruleId of missing) console.log(`missing: ${ruleId}`);
  for (const ruleId of unexpected) console.log(`unexpected: ${ruleId}`);
  if (missing.length === 0 && unexpected.length === 0) {
    console.log(`ok: the findings match the ${String(expected.length)} expect entries`);
  } else {
    process.exitCode = 1;
  }
}
