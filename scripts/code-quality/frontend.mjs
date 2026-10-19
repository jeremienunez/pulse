import fs from 'node:fs';
import path from 'node:path';
import { coverage, loadPackage } from './adapters.mjs';
import { matches } from './policy.mjs';
import { isJavaScript, languageOf } from './metrics.mjs';
import { javascriptFacts } from './javascript.mjs';

const DEFAULT_PROPERTIES = [
  'color',
  'background',
  'background-color',
  'border-color',
  'margin',
  'padding',
  'gap',
  'font-size',
  'font-family',
  'font-weight',
  'line-height',
  'border-radius',
  'box-shadow',
  'transition-duration',
  'animation-duration',
];
function tokenReferences(parsed) {
  const names = [];
  parsed.walk((node) => {
    if (node.type === 'function' && node.value.toLowerCase() === 'var') {
      const token = node.nodes.find((n) => n.type === 'word');
      if (token) names.push(token.value);
    }
  });
  return names;
}
export function inspectValue(value, property, settings, known, parseValue) {
  const parsed = parseValue(value),
    references = tokenReferences(parsed),
    messages = [];
  for (const name of references)
    if (!known.has(name))
      messages.push({ ruleId: 'tokens/unknown', message: `Unknown declared token: ${name}`, target: name });
  const tokenized = (settings.properties?.length ? settings.properties : DEFAULT_PROPERTIES).includes(
    property,
  );
  if (!tokenized) return messages;
  const allowed = new Set([
    '0',
    'auto',
    'inherit',
    'initial',
    'unset',
    'revert',
    'none',
    'normal',
    'currentColor',
    'transparent',
    ...(Array.isArray(settings.allowedValues)
      ? settings.allowedValues
      : (settings.allowedValues?.[property] ?? [])),
  ]);
  if (allowed.has(value.trim())) return messages;
  let raw = false;
  function inspect(nodes, inCalculation = false) {
    for (const node of nodes) {
      if (node.type === 'space' || node.type === 'comment' || node.type === 'div') continue;
      if (node.type === 'function' && node.value.toLowerCase() === 'var') {
        const comma = node.nodes.findIndex((n) => n.type === 'div' && n.value === ',');
        if (comma >= 0) inspect(node.nodes.slice(comma + 1), inCalculation);
        continue;
      }
      if (node.type === 'function' && ['calc', 'min', 'max', 'clamp'].includes(node.value.toLowerCase())) {
        inspect(node.nodes, true);
        continue;
      }
      if (
        node.type === 'word' &&
        (allowed.has(node.value) || (inCalculation && /^(?:[+*/-]|\d+(?:\.\d+)?)$/u.test(node.value)))
      )
        continue;
      raw = true;
    }
  }
  inspect(parsed.nodes);
  if (!references.length || raw)
    messages.push({
      ruleId: 'tokens/literal',
      message: `Use a declared design token for ${property}: ${value}`,
      target: property,
    });
  return messages;
}
export async function collectFrontend(ctx, allFiles, policy) {
  const settings = policy.tokens;
  if (!settings) {
    if (allFiles.some((f) => /\.(?:css|scss|sass|less|jsx|tsx|vue|svelte)$/u.test(f)))
      throw new Error('Selected UI sources require an explicit token contract');
    return {
      findings: [],
      coverage: [
        coverage('frontend/tokens', 'not_applicable', [], {
          reason: 'No selected UI source or token contract',
        }),
      ],
    };
  }
  const files = allFiles.filter((f) => settings.include.some((p) => matches(f, p))),
    findings = [],
    rows = [];
  if (!files.length) return { findings, coverage: [coverage('frontend/tokens', 'not_applicable', [])] };
  const postcss = await loadPackage(ctx, 'postcss'),
    parseValue = await loadPackage(ctx, 'postcss-value-parser'),
    stylelint = await loadPackage(ctx, 'stylelint');
  const rootNames = new Set(),
    tokenFiles = new Set(settings.files),
    localPattern = settings.localPattern ? new RegExp(settings.localPattern, 'u') : null;
  for (const filename of settings.files) {
    const full = path.join(ctx.candidate.root, filename);
    if (!ctx.candidate.entries.some((e) => e.path === filename) || !fs.existsSync(full))
      throw new Error(`Token definitions are not captured: ${filename}`);
    postcss.parse(fs.readFileSync(full, 'utf8'), { from: filename }).walkDecls((d) => {
      if (!d.prop.startsWith('--')) return;
      rootNames.add(d.prop);
      if (!new RegExp(settings.namePattern ?? '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$', 'u').test(d.prop.slice(2)))
        findings.push({
          ruleId: 'tokens/name',
          language: languageOf(filename),
          path: filename,
          line: d.source.start.line,
          target: d.prop,
          kind: 'violation',
          severity: 'error',
          message: `Token ${d.prop} violates the declared naming convention`,
        });
    });
  }
  rows.push(
    coverage('frontend/token-definitions', 'checked', settings.files, {
      method: 'postcss-declared-definitions',
      cascade_resolution: false,
    }),
  );
  const add = (filename, line, d) =>
    findings.push({
      language: languageOf(filename),
      path: filename,
      line,
      kind: 'violation',
      severity: 'error',
      ...d,
    });
  for (const filename of files) {
    const source = fs.readFileSync(path.join(ctx.candidate.root, filename), 'utf8');
    if (filename.endsWith('.css') || filename.endsWith('.scss')) {
      const syntax = filename.endsWith('.scss') ? await loadPackage(ctx, 'postcss-scss') : null;
      const parsed = syntax
        ? syntax.parse(source, { from: filename })
        : postcss.parse(source, { from: filename });
      const known = new Set(rootNames);
      parsed.walkDecls((d) => {
        if (d.prop.startsWith('--') && localPattern?.test(d.prop)) known.add(d.prop);
      });
      const config = {
        referenceFiles: settings.files.map((f) => path.join(ctx.candidate.root, f)),
        rules: {
          'no-unknown-custom-properties': true,
          'declaration-block-no-duplicate-custom-properties': true,
        },
      };
      const lint = await stylelint.lint({
        code: source,
        codeFilename: path.join(ctx.candidate.root, filename),
        config,
        ...(syntax ? { customSyntax: syntax } : {}),
      });
      for (const result of lint.results) {
        if (result.ignored || result.parseErrors?.length || result.invalidOptionWarnings?.length)
          throw new Error(`Stylelint could not qualify ${filename}`);
        for (const d of result.warnings)
          add(filename, d.line, {
            ruleId: `stylelint/${d.rule}`,
            target: d.rule,
            severity: d.severity,
            message: d.text,
          });
      }
      parsed.walkDecls((d) => {
        if (tokenFiles.has(filename)) return;
        if (d.prop.startsWith('--')) {
          if (!localPattern?.test(d.prop))
            add(filename, d.source.start.line, {
              ruleId: 'tokens/definition-owner',
              target: d.prop,
              message: `Define ${d.prop} in a declared token source`,
            });
          return;
        }
        for (const message of inspectValue(d.value, d.prop, settings, known, parseValue))
          add(filename, d.source.start.line, message);
      });
      rows.push(
        coverage('frontend/css-tokens', 'checked', [filename], {
          method: 'stylelint+postcss',
          cascade_resolution: false,
        }),
      );
    } else if (isJavaScript(filename)) {
      const facts = await javascriptFacts(ctx, filename);
      for (const style of facts.styles)
        for (const message of inspectValue(style.value, style.property, settings, rootNames, parseValue))
          add(filename, style.line, message);
      for (const d of facts.dynamicStyles) {
        rows.push(
          coverage('frontend/dynamic-jsx', 'unsupported', [filename], {
            required: settings.requiredDynamic === true,
            reason: 'Arbitrary JS style expressions are not evaluated',
          }),
        );
        findings.push({
          ruleId: 'tokens/dynamic-review',
          language: languageOf(filename),
          path: filename,
          line: d.line,
          kind: 'review',
          severity: 'info',
          message: 'Review dynamic style against the actual design system; no complete token claim',
        });
      }
      for (const c of facts.classNames)
        for (const name of c.value.split(/\s+/u))
          if (/\[[^\]]+\]/u.test(name)) {
            const value = name.slice(name.indexOf('[') + 1, name.lastIndexOf(']'));
            if (!value.startsWith('var(--'))
              findings.push({
                ruleId: 'tokens/arbitrary-class-review',
                language: languageOf(filename),
                path: filename,
                line: c.line,
                target: name,
                kind: 'review',
                severity: 'warning',
                message: 'Review arbitrary utility-class value against declared design tokens',
              });
          }
      rows.push(
        coverage('frontend/static-jsx', 'checked', [filename], {
          method: 'typescript-eslint-static-properties',
          dynamic_evaluation: false,
          tailwind_semantics: false,
        }),
      );
    } else
      rows.push(
        coverage('frontend/syntax', 'unsupported', [filename], {
          required: true,
          reason: 'No qualified token adapter for this UI syntax',
        }),
      );
  }
  return { findings, coverage: rows };
}
