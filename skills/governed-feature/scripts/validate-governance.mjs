#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const REQUIRED_SECTIONS = [
  'Governance Metadata',
  'Requirements References',
  'Entities',
  'Approach',
  'Structure',
  'Operations',
  'Norms',
  'Safeguards',
  'Traceability',
  'Review Record',
  'Open Blockers',
  'Approval State',
];

const OPERATION_FIELDS = [
  'Status',
  'Intent refs',
  'Actor / trigger',
  'Preconditions',
  'Behavior',
  'Postconditions / invariants',
  'Failure behavior',
  'Verification target',
];

const METADATA_FIELDS = [
  'Feature',
  'Fitness',
  'Change class',
  'Overlay status',
  'Authoritative context',
  'Context approval/version',
  'Last reviewed',
];

const APPROVAL_FIELDS = [
  'Structural completeness',
  'Semantic review',
  'Human Pulse gate',
  'Approval evidence',
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getSection(markdown, heading) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trimEnd() === `## ${heading}`);
  if (start === -1) return null;
  const relativeEnd = lines.slice(start + 1).findIndex((line) => line.startsWith('## '));
  const end = relativeEnd === -1 ? lines.length : start + 1 + relativeEnd;
  return lines.slice(start + 1, end).join('\n').trim();
}

function getSubsection(section, heading) {
  if (section === null) return null;
  const lines = section.split('\n');
  const start = lines.findIndex((line) => line.trimEnd() === `### ${heading}`);
  if (start === -1) return null;
  const relativeEnd = lines
    .slice(start + 1)
    .findIndex((line) => line.startsWith('## ') || line.startsWith('### '));
  const end = relativeEnd === -1 ? lines.length : start + 1 + relativeEnd;
  return lines.slice(start + 1, end).join('\n').trim();
}

function getField(section, name) {
  if (section === null) return null;
  const pattern = new RegExp(`^- ${escapeRegExp(name)}:\\s*(.+?)\\s*$`, 'm');
  return section.match(pattern)?.[1]?.trim() ?? null;
}

function tableRows(section) {
  if (!section) return [];
  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && line.endsWith('|'))
    .map((line) => line.slice(1, -1).split('|').map((cell) => cell.trim()))
    .filter((cells) => !cells.every((cell) => /^:?-{3,}:?$/.test(cell)))
    .slice(1);
}

function parseOperations(section) {
  if (!section) return [];
  const headings = [...section.matchAll(/^### (OP-(\d+))\s+[—-]\s+(.+)$/gm)];
  return headings.map((match, index) => {
    const start = match.index + match[0].length;
    const end = headings[index + 1]?.index ?? section.length;
    const body = section.slice(start, end).trim();
    const fields = Object.fromEntries(
      OPERATION_FIELDS.map((field) => [field, getField(body, field)]),
    );
    return { id: match[1], number: Number(match[2]), title: match[3].trim(), fields };
  });
}

function cleanValue(value) {
  return value?.replace(/^`|`$/g, '') ?? '';
}

export function validateGovernanceText(markdown, file = '<memory>') {
  const normalized = markdown.replace(/\r\n?/g, '\n');
  const errors = [];

  for (const heading of REQUIRED_SECTIONS) {
    if (getSection(normalized, heading) === null) {
      errors.push(`Missing required section: ## ${heading}`);
    }
  }

  const placeholders = [...normalized.matchAll(/<[^>\n]+>/g)].map((match) => match[0]);
  if (placeholders.length > 0) {
    errors.push(`Unresolved template placeholders: ${[...new Set(placeholders)].join(', ')}`);
  }

  const metadata = getSection(normalized, 'Governance Metadata');
  for (const field of METADATA_FIELDS) {
    if (!getField(metadata, field)) errors.push(`Missing governance metadata field: ${field}`);
  }

  if (cleanValue(getField(metadata, 'Fitness')) !== 'strong') {
    errors.push('Governance Metadata Fitness must be strong');
  }

  const changeClass = cleanValue(getField(metadata, 'Change class'));
  if (!['new', 'intent-change', 'preserve', 'containment', 'test-only'].includes(changeClass)) {
    errors.push(`Unsupported Change class: ${changeClass || '(missing)'}`);
  }

  const contextPath = cleanValue(getField(metadata, 'Authoritative context'));
  if (!/^history\/[^/]+\/CONTEXT\.md$/.test(contextPath)) {
    errors.push('Authoritative context must be history/<feature>/CONTEXT.md');
  }

  const requirementRows = tableRows(getSection(normalized, 'Requirements References'));
  if (requirementRows.length === 0) {
    errors.push('Requirements References must include at least one data row');
  }
  for (const [reference = ''] of requirementRows) {
    if (!/\b[DS][A-Za-z0-9._-]*\d+\b/.test(reference)) {
      errors.push(`Requirements reference lacks a stable decision/scenario ID: ${reference || '(empty)'}`);
    }
  }

  const requirements = getSection(normalized, 'Requirements References');
  for (const scope of ['Scope In', 'Scope Out']) {
    const content = getSubsection(requirements, scope);
    if (!content) errors.push(`Missing or empty requirements subsection: ### ${scope}`);
  }

  const operations = parseOperations(getSection(normalized, 'Operations'));
  if (operations.length === 0) errors.push('Operations must define at least one OP-n');

  const seen = new Set();
  for (const operation of operations) {
    if (seen.has(operation.id)) errors.push(`Duplicate operation ID: ${operation.id}`);
    seen.add(operation.id);
    for (const [field, value] of Object.entries(operation.fields)) {
      if (!value) errors.push(`${operation.id} is missing field: ${field}`);
    }
    const status = cleanValue(operation.fields.Status);
    if (status && !['active', 'retired'].includes(status)) {
      errors.push(`${operation.id} has unsupported Status: ${status}`);
    }
  }

  const traceRows = tableRows(getSection(normalized, 'Traceability'));
  if (traceRows.length === 0) errors.push('Traceability must include at least one data row');
  const tracedOperations = new Set();
  for (const row of traceRows) {
    const [reference = '', operationCell = '', , verification = ''] = row;
    if (!/\b[DS][A-Za-z0-9._-]*\d+\b/.test(reference)) {
      errors.push(`Traceability row lacks a stable decision/scenario ID: ${reference || '(empty)'}`);
    }
    const operationRefs = [...operationCell.matchAll(/\bOP-\d+\b/g)].map((match) => match[0]);
    if (operationRefs.length === 0) {
      errors.push(`Traceability row lacks an OP-n reference for ${reference || '(unknown reference)'}`);
    }
    for (const operationRef of operationRefs) {
      tracedOperations.add(operationRef);
      if (!seen.has(operationRef)) errors.push(`Traceability references unknown operation: ${operationRef}`);
    }
    if (!verification) errors.push(`Traceability row lacks a verification target for ${reference || '(unknown reference)'}`);
  }

  for (const operation of operations) {
    if (cleanValue(operation.fields.Status) === 'active' && !tracedOperations.has(operation.id)) {
      errors.push(`Active operation is not referenced by Traceability: ${operation.id}`);
    }
  }

  const approval = getSection(normalized, 'Approval State');
  for (const field of APPROVAL_FIELDS) {
    if (!getField(approval, field)) errors.push(`Missing approval-state field: ${field}`);
  }

  return {
    valid: errors.length === 0,
    file,
    structural_validation: errors.length === 0 ? 'pass' : 'fail',
    semantic_validation: 'not_performed',
    grants_approval: false,
    errors,
  };
}

function renderText(result) {
  const lines = [
    `Structural validation: ${result.structural_validation}`,
    'Semantic validation: not performed',
    'Approval granted: no',
  ];
  for (const error of result.errors) lines.push(`- ${error}`);
  return lines.join('\n');
}

async function main(argv) {
  const json = argv.includes('--json');
  const paths = argv.filter((arg) => arg !== '--json');
  if (paths.length !== 1) {
    const result = {
      valid: false,
      file: paths[0] ?? '',
      structural_validation: 'fail',
      semantic_validation: 'not_performed',
      grants_approval: false,
      errors: ['Usage: validate-governance.mjs [--json] <governance.md>'],
    };
    console[json ? 'log' : 'error'](json ? JSON.stringify(result, null, 2) : renderText(result));
    return 2;
  }

  try {
    const markdown = await readFile(paths[0], 'utf8');
    const result = validateGovernanceText(markdown, paths[0]);
    console.log(json ? JSON.stringify(result, null, 2) : renderText(result));
    return result.valid ? 0 : 1;
  } catch (error) {
    const result = {
      valid: false,
      file: paths[0],
      structural_validation: 'fail',
      semantic_validation: 'not_performed',
      grants_approval: false,
      errors: [`Unable to read governance artifact: ${error.message}`],
    };
    console[json ? 'log' : 'error'](json ? JSON.stringify(result, null, 2) : renderText(result));
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
