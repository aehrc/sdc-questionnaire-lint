// Generates SUSHI projects from YAML configs. The lint cases (test/cases/<group>/<case>.yaml) are
// compiled together by test/support/cases.ts; npm run demo compiles one config on its own, then
// compiles and lints it with example.ts, to try a form by hand. Run from the repository root:
//   npm run demo                                    test/cases/demo/invalid-demo.yaml into demo/invalid-demo
//   npm run demo -- path/to/config.yaml             another config, into demo/<instance>
//   npm run demo -- path/to/config.yaml --out dir   another output folder
//
// Quote every whole expression: "%a", "1", "'text'". Unquoted, %a is invalid YAML and 1 is a
// number, and 'text' alone is YAML quoting, so the FHIRPath string literal becomes a path.
//
// Config:    { instance?, status?, hostVariables?, extensions?, fsh?, items?, contained? }
// Item:      { linkId, type, text?, extensions?, fsh?, items? }
// Extension: { url, name?, language?, expression?, reference? } (at least one of the last two)
// Contained: { extensions?, fsh?, items? }
// - instance defaults to the file name; a case's is <group>-<case>.
// - hostVariables become the linter config of this Questionnaire.
// - url is an alias (see extensionUrls) or a full URL, written as is. An extension that holds its
//   Expression in a sub-extension, such as contextExpression, is written as raw fsh lines.
// - language defaults to text/fhirpath.
// - fsh holds raw FSH lines for anything else (launchContext, answerOption, enableWhen…), written
//   after the extensions of the same level, below its path: "required = true" on an item becomes
//   "* item[=].required = true".
// - contained Questionnaires become inline instances named <instance>-contained-<n>.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parse } from 'yaml';

export interface FshExtension {
  url: string;
  name?: string;
  language?: string;
  expression?: string;
  reference?: string;
}

export interface FshItem {
  linkId: string;
  type: string;
  text?: string;
  extensions?: FshExtension[];
  fsh?: string[];
  items?: FshItem[];
}

export interface FshContained {
  extensions?: FshExtension[];
  fsh?: string[];
  items?: FshItem[];
}

export interface FshConfig extends FshContained {
  instance: string;
  status?: string;
  hostVariables?: string[];
  contained?: FshContained[];
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
    'itemPopulationContext',
  ].map((alias): [string, string] => [alias, `${sdc}${alias}`]),
]);

const fshString = (value: string): string =>
  `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

// A list of one has no index. A longer one starts each entry with [0] or [+] and refers back to it
// with [=] on the entry's other lines.
const index = (length: number, entry: number, line: number): string =>
  length === 1 ? '' : line > 0 ? '[=]' : entry === 0 ? '[0]' : '[+]';

function extensionLines(prefix: string, extensions: readonly FshExtension[]): string[] {
  return extensions.flatMap((extension, entry) => {
    const { url, name, language = 'text/fhirpath', expression, reference } = extension;
    const fields = [
      `url = ${fshString(extensionUrls.get(url) ?? url)}`,
      ...(name === undefined ? [] : [`valueExpression.name = ${fshString(name)}`]),
      `valueExpression.language = #${language}`,
      ...(expression === undefined
        ? []
        : [`valueExpression.expression = ${fshString(expression)}`]),
      ...(reference === undefined ? [] : [`valueExpression.reference = ${fshString(reference)}`]),
    ];
    return fields.map(
      (field, line) => `* ${prefix}extension${index(extensions.length, entry, line)}.${field}`,
    );
  });
}

function itemLines(prefix: string, items: readonly FshItem[]): string[] {
  return items.flatMap((item, entry) => {
    const at = `${prefix}item[=].`;
    return [
      `* ${prefix}item${entry === 0 ? '[0]' : '[+]'}.linkId = ${fshString(item.linkId)}`,
      `* ${at}type = #${item.type}`,
      ...(item.text === undefined ? [] : [`* ${at}text = ${fshString(item.text)}`]),
      ...extensionLines(at, item.extensions ?? []),
      ...(item.fsh ?? []).map((line) => `* ${at}${line}`),
      ...itemLines(at, item.items ?? []),
    ];
  });
}

function instanceLines(name: string, usage: string, status: string, body: FshContained): string[] {
  return [
    `Instance: ${name}`,
    'InstanceOf: Questionnaire',
    `Usage: #${usage}`,
    `* status = #${status}`,
    ...extensionLines('', body.extensions ?? []),
    ...(body.fsh ?? []).map((line) => `* ${line}`),
    ...itemLines('', body.items ?? []),
  ];
}

export function renderFsh(config: FshConfig): string {
  const contained = (config.contained ?? []).map((body, entry) => ({
    name: `${config.instance}-contained-${String(entry + 1)}`,
    body,
  }));
  return [
    ...instanceLines(config.instance, 'example', config.status ?? 'draft', config),
    ...contained.map(({ name }, entry) => `* contained${entry === 0 ? '[0]' : '[+]'} = ${name}`),
    ...contained.flatMap(({ name, body }) => ['', ...instanceLines(name, 'inline', 'draft', body)]),
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
  list(json, at, 'extensions').forEach((value, entry) => {
    const where = child(at, `extensions[${String(entry)}]`);
    const extension = object(value, where, ['url', 'name', 'language', 'expression', 'reference']);
    checkStrings(extension, where, ['url'], ['name', 'language', 'expression', 'reference']);
    const url = extension.url as string;
    if (!extensionUrls.has(url) && !url.includes('://')) {
      throw new Error(
        `${where}: url ${url} is neither a full URL nor an alias (${[...extensionUrls.keys()].join(', ')})`,
      );
    }
    if (extension.expression === undefined && extension.reference === undefined) {
      throw new Error(`${where}: give an expression, a reference or both`);
    }
  });
}

function checkItems(json: JsonObject, at: string): void {
  list(json, at, 'items').forEach((value, entry) => {
    const where = child(at, `items[${String(entry)}]`);
    const item = object(value, where, ['linkId', 'type', 'text', 'extensions', 'fsh', 'items']);
    checkStrings(item, where, ['linkId', 'type'], ['text']);
    checkLines(item, where, 'fsh');
    checkExtensions(item, where);
    checkItems(item, where);
  });
}

function checkBody(json: JsonObject, at: string): void {
  checkLines(json, at, 'fsh');
  checkExtensions(json, at);
  checkItems(json, at);
}

// Checks a parsed config and returns it typed, or throws an Error naming the path in the config.
// instance is the name to use when the config gives none; a config that gives another one fails.
export function parseFshConfig(value: unknown, instance?: string): FshConfig {
  const config = object(value, '', [
    'instance',
    'status',
    'hostVariables',
    'extensions',
    'fsh',
    'items',
    'contained',
  ]);
  checkStrings(config, '', [], ['instance', 'status']);
  const name = (config.instance as string | undefined) ?? instance;
  if (name === undefined) throw new Error('config: instance is required');
  if (instance !== undefined && name !== instance) {
    throw new Error(`config: instance ${name} does not match ${instance}`);
  }
  // The instance names the output folder and the FSH file.
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(name)) {
    throw new Error('config: instance must be letters, digits and hyphens');
  }
  checkLines(config, '', 'hostVariables');
  checkBody(config, '');
  list(config, '', 'contained').forEach((body, entry) => {
    const where = `contained[${String(entry)}]`;
    checkBody(object(body, where, ['extensions', 'fsh', 'items']), where);
  });
  return { ...(config as unknown as FshConfig), instance: name };
}

// Reads a YAML config; instance defaults to the file name.
export function readFshConfig(
  file: string,
  instance = path.basename(file, path.extname(file)),
): FshConfig {
  let config: unknown;
  try {
    config = parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${file}: ${(error as Error).message}`, { cause: error });
  }
  try {
    return parseFshConfig(config, instance);
  } catch (error) {
    throw new Error(`${file}: ${(error as Error).message}`, { cause: error });
  }
}

export const sushiConfig = [
  'canonical: http://example.org/sdc-questionnaire-lint',
  'status: draft',
  'version: 0.1.0',
  'fhirVersion: 4.0.1',
  'FSHOnly: true',
  'dependencies:',
  '  hl7.fhir.uv.sdc: 4.0.0',
  '',
].join('\n');

// The linter config of a config with hostVariables, at the project root, because the linter
// resolves the FSH directories and the SUSHI index against the config's directory.
export const lintConfigFile = (config: FshConfig): string | undefined =>
  config.hostVariables === undefined ? undefined : `lint-config-${config.instance}.json`;

// One SUSHI project holding every config, one FSH file each. Replaces only what the generator and
// SUSHI write, so a wrong --out cannot wipe other files.
export function generateProject(configs: readonly FshConfig[], outDir: string): void {
  const instances = configs.map(({ instance }) => instance);
  const repeated = instances.find((instance, entry) => instances.indexOf(instance) !== entry);
  if (repeated !== undefined) throw new Error(`instance ${repeated} is used more than once`);
  for (const generated of ['sushi-config.yaml', 'input', 'fsh-generated']) {
    rmSync(path.join(outDir, generated), { recursive: true, force: true });
  }
  mkdirSync(path.join(outDir, 'input', 'fsh'), { recursive: true });
  writeFileSync(path.join(outDir, 'sushi-config.yaml'), sushiConfig);
  for (const config of configs) {
    writeFileSync(path.join(outDir, 'input', 'fsh', `${config.instance}.fsh`), renderFsh(config));
    const lintConfig = lintConfigFile(config);
    if (lintConfig !== undefined) {
      const content = `${JSON.stringify({ hostVariables: config.hostVariables }, null, 2)}\n`;
      writeFileSync(path.join(outDir, lintConfig), content);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const example = fileURLToPath(new URL('example.ts', import.meta.url));

  let config: FshConfig;
  let project: string;
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: { out: { type: 'string' } },
    });
    config = readFshConfig(
      positionals[0] ??
        fileURLToPath(new URL('../test/cases/demo/invalid-demo.yaml', import.meta.url)),
    );
    project = path.resolve(values.out ?? path.join(repoRoot, 'demo', config.instance));
    generateProject([config], project);
  } catch (error) {
    console.error(`error: ${(error as Error).message}`);
    process.exit(2);
  }
  console.log(`Generated ${path.relative(process.cwd(), project) || '.'}`);

  // example.ts compiles the project with SUSHI and prints the text report.
  const lintConfig = lintConfigFile(config);
  const run = spawnSync(
    process.execPath,
    [
      example,
      project,
      '--show-info',
      ...(lintConfig === undefined ? [] : ['--config', lintConfig]),
    ],
    { stdio: 'inherit' },
  );
  process.exitCode = run.status ?? 2;
}
