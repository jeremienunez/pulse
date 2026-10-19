#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { runQuality } from './lib/pulse-quality.mjs';
try {
  const { values } = parseArgs({
    options: {
      profile: { type: 'string' },
      'repo-root': { type: 'string', default: process.cwd() },
      json: { type: 'boolean', default: false },
      scope: { type: 'string', default: 'pulse' },
      policy: { type: 'string' },
      'toolchain-root': { type: 'string' },
      mode: { type: 'string' },
      'evaluation-date': { type: 'string' },
      'baseline-from': { type: 'string' },
      'export-baseline': { type: 'string' },
    },
  });
  if (!['commit', 'ci'].includes(values.profile) || !['pulse', 'code'].includes(values.scope))
    throw new Error(
      'Usage: pulse-quality.mjs --profile commit|ci [--scope pulse|code] [--repo-root PATH] [--json]',
    );
  if ((values['baseline-from'] || values['export-baseline']) && values.scope !== 'code')
    throw new Error('Baseline export is an explicit code-scope operation');
  const report = await runQuality(values['repo-root'], values.profile, {
    scope: values.scope,
    policyFile: values.policy,
    toolchainRoot: values['toolchain-root'],
    mode: values.mode,
    evaluationDate: values['evaluation-date'],
    baselineFrom: values['baseline-from'],
    exportBaseline: values['export-baseline'],
    onStep: values.json
      ? undefined
      : (id) => {
          if (!id.startsWith('syntax:')) process.stderr.write(`quality: ${id}\n`);
        },
  });
  process.stdout.write(
    values.json
      ? `${JSON.stringify(report, null, 2)}\n`
      : `Quality ${report.profile}: ${report.status}\nTree: ${report.tree}\nReport: ${report.report_path}\n${report.reason ? `${report.reason}\n` : ''}`,
  );
  if (!values.json) {
    const code = report.code_quality ?? (values.scope === 'code' ? report : null);
    if (code) {
      const c = code.counts;
      process.stdout.write(
        `Code quality: ${code.status}${c ? `; new errors ${c.new_errors}, warnings ${c.warnings}, review ${c.review}, legacy ${c.legacy}, exceptions ${c.excepted}` : ''}\n`,
      );
      const visible = code.findings.filter(
        (f) => f.disposition === 'new' && (f.severity !== 'info' || f.kind === 'review'),
      );
      for (const f of visible.slice(0, 12))
        process.stdout.write(`${f.path}${f.line ? `:${f.line}` : ''} [${f.ruleId}] ${f.message}\n`);
      if (visible.length > 12)
        process.stdout.write(`${visible.length - 12} further findings in the receipt.\n`);
      for (const c of code.coverage.filter((c) => ['unsupported', 'unavailable'].includes(c.status)))
        process.stdout.write(
          `Coverage ${c.id}: ${c.status}${c.required === false ? ' (advisory)' : ' (required)'} — ${c.reason ?? ''}\n`,
        );
    }
  }
  process.exitCode =
    report.exit_code ?? (report.status === 'passed' ? 0 : report.status === 'failed' ? 1 : 2);
} catch (error) {
  process.stderr.write(`Quality unavailable: ${error.message}\n`);
  process.exitCode = 2;
}
