import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { metricFinding } from './policy.mjs';
import { coverage, readJSON, resolveBinary, runTool, sourcePath } from './adapters.mjs';

const LANGUAGE_EXTENSIONS = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  cs: 'csharp',
  cpp: 'cpp',
  cxx: 'cpp',
  cc: 'cpp',
  c: 'c',
  h: 'c',
  hpp: 'cpp',
  php: 'php',
  rb: 'ruby',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  dart: 'dart',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  vue: 'vue',
  svelte: 'svelte',
  zig: 'zig',
  lua: 'lua',
  ex: 'elixir',
  exs: 'elixir',
};
export const languageOf = (filename) => {
  const extension = path.posix.extname(filename).slice(1).toLowerCase();
  return Object.hasOwn(LANGUAGE_EXTENSIONS, extension) ? LANGUAGE_EXTENSIONS[extension] : 'unknown';
};
export const isJavaScript = (filename) => ['javascript', 'typescript'].includes(languageOf(filename));
export async function collectMetrics(ctx, files, policy) {
  const findings = [],
    coverageRows = [],
    wanted = new Set(files);
  if (!files.length)
    return { findings, coverage: [coverage('metrics/files', 'not_applicable', [])], metrics: [] };
  const binary = resolveBinary(ctx, 'tokei');
  const process = runTool(ctx, 'tokei', binary, [
    '--hidden',
    '--no-ignore',
    '--files',
    '--output',
    'json',
    ...files.map((f) => `./${f}`),
  ]);
  const data = readJSON(process.stdout, 'Tokei'),
    seen = new Map();
  for (const [language, summary] of Object.entries(data)) {
    if (language === 'Total') continue;
    if (!summary || !Array.isArray(summary.reports) || summary.inaccurate)
      throw new Error(`Incomplete Tokei coverage for ${language}`);
    for (const report of summary.reports) {
      const filename = sourcePath(ctx.candidate.root, report.name);
      if (!wanted.has(filename) || !Number.isSafeInteger(report.stats?.code) || report.stats.code < 0)
        throw new Error('Unexpected or invalid Tokei record');
      if (seen.has(filename)) throw new Error(`Duplicate file census: ${filename}`);
      seen.set(filename, {
        path: filename,
        language: languageOf(filename) === 'unknown' ? language.toLowerCase() : languageOf(filename),
        code: report.stats.code,
        comments: report.stats.comments,
        blanks: report.stats.blanks,
      });
    }
  }
  for (const f of files) {
    if (!seen.has(f)) {
      coverageRows.push(
        coverage('metrics/files', 'unsupported', [f], {
          reason: 'Counter did not recognize captured source',
          required: true,
        }),
      );
      continue;
    }
    const row = seen.get(f);
    findings.push(metricFinding('file_lines', row.code, { path: f, language: row.language }, policy));
  }
  coverageRows.push(
    coverage('metrics/files', 'checked', [...seen.keys()], {
      method: 'tokei-code-lines',
      supported_metrics: ['file_lines'],
    }),
  );
  const others = files.filter(
    (f) =>
      !(isJavaScript(f) && policy.profiles.includes('javascript')) &&
      !(languageOf(f) === 'python' && policy.profiles.includes('python')) &&
      !['css', 'scss', 'sass', 'less', 'shell', 'dart', 'svelte', 'elixir', 'unknown'].includes(
        languageOf(f),
      ),
  );
  if (others.length) {
    try {
      const facts = pythonFacts(ctx, others, 'lizard');
      for (const row of facts) {
        if (row.generation_marker) {
          coverageRows.push(
            coverage('metrics/functions', 'unsupported', [row.path], {
              required: false,
              reason: 'Lizard marker can suppress source; no completeness claim',
            }),
          );
          continue;
        }
        for (const fn of row.functions)
          for (const [metric, key] of [
            ['function_lines', 'nloc'],
            ['complexity', 'complexity'],
            ['parameters', 'parameters'],
          ])
            findings.push(
              metricFinding(
                metric,
                fn[key],
                {
                  path: row.path,
                  language: languageOf(row.path),
                  symbol: fn.symbol,
                  line: fn.start,
                  target: 'lizard-lexical-v1',
                },
                policy,
              ),
            );
        coverageRows.push(
          coverage('metrics/functions', 'checked', [row.path], {
            method: 'lizard-lexical',
            complete_ast: false,
            required: false,
          }),
        );
      }
    } catch (error) {
      coverageRows.push(
        coverage('metrics/functions', 'unavailable', others, {
          required: false,
          reason: error.message,
        }),
      );
    }
  }
  return { findings, coverage: coverageRows, metrics: [...seen.values()] };
}

export function strictBudgetCoverage(files, policy, rows) {
  const missing = [];
  const classLanguages = new Set([
    'javascript',
    'typescript',
    'python',
    'java',
    'csharp',
    'cpp',
    'php',
    'ruby',
    'swift',
    'kotlin',
    'dart',
  ]);
  for (const metric of policy.strictBudgets) {
    const applicable = files.filter((file) => {
      const language = languageOf(file);
      if (metric === 'file_lines') return true;
      if (['class_lines', 'public_methods'].includes(metric))
        return classLanguages.has(language) || language === 'unknown';
      return !['css', 'scss', 'sass', 'less', 'json'].includes(language);
    });
    const uncovered = applicable.filter(
      (file) =>
        !rows.some(
          (row) =>
            ['checked', 'not_scheduled'].includes(row.status) &&
            row.files.includes(file) &&
            (row.supported_metrics?.includes(metric) || row.capabilities?.includes(`size/${metric}`)),
        ),
    );
    if (uncovered.length)
      missing.push(
        coverage(`policy/strict-${metric}`, 'unsupported', uncovered, {
          required: true,
          reason: `No qualified ${metric} budget check for these source files; lexical/lint coverage alone is insufficient`,
        }),
      );
  }
  return missing;
}
export function pythonFacts(ctx, files, mode = 'python') {
  const key = `${mode}:${files.join('\0')}`;
  if (ctx.cache.has(key)) return ctx.cache.get(key);
  const binary = resolveBinary(ctx, 'python');
  const script = fileURLToPath(new URL('./python-ast.py', import.meta.url));
  const process = runTool(ctx, `facts-${mode}`, binary, ['-I', script], {
    input: JSON.stringify({ root: ctx.candidate.root, files, mode }),
  });
  const data = readJSON(process.stdout, 'native facts');
  if (
    !Array.isArray(data) ||
    data.length !== files.length ||
    data.some((row) => !files.includes(row.path) || !Array.isArray(row.functions))
  )
    throw new Error('Incomplete native facts coverage');
  ctx.cache.set(key, data);
  return data;
}
