import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateGovernanceText } from './validate-governance.mjs';

const VALID = `# Governance Overlay

## Governance Metadata

- Feature: payments
- Fitness: strong
- Change class: new
- Overlay status: current
- Authoritative context: history/payments/CONTEXT.md
- Context approval/version: Gate 1 approved
- Last reviewed: 2026-08-04T12:00:00Z

## Requirements References

| Decision/scenario ID | Derived acceptance mapping | Notes |
|---|---|---|
| D1, S2 | Payment approval remains traceable | none |

### Scope In

- Payment approval behavior

### Scope Out

- Visual redesign

## Entities

| Entity / concept | Responsibility | Owner boundary | Invariants |
|---|---|---|---|
| Payment | Authorize a plan charge | billing | Tokens remain confidential |

## Approach

Use the existing billing boundary and provider adapter.

## Structure

| Boundary / component | Responsibility | Dependencies | Owner | Constraint |
|---|---|---|---|---|
| billing | Payment decisions | provider | payments | No UI ownership |

## Operations

### OP-1 — Authorize payment

- Status: active
- Intent refs: D1, S2
- Actor / trigger: Customer submits payment
- Preconditions: Valid plan and token
- Behavior: Return an authorization decision
- Postconditions / invariants: Token remains confidential
- Failure behavior: Return a stable decline reason
- Verification target: Provider integration test

## Norms

| Norm ID | Rule | Applies to | Evidence / enforcement |
|---|---|---|---|
| N-1 | Never log tokens | OP-1 | Security review |

## Safeguards

| Risk / invariant | Prevention | Detection | Recovery | Owner |
|---|---|---|---|---|
| Token disclosure | Redaction | Log scan | Revoke token | payments |

## Traceability

| Decision/scenario | Operation | Invariant / safeguard | Verification target | Evidence status |
|---|---|---|---|---|
| D1, S2 | OP-1 | Token confidentiality | Provider integration test | planned |

## Review Record

| Date | Reviewer / role | Scope | Finding | Resolution |
|---|---|---|---|---|
| 2026-08-04 | domain reviewer | D1 / OP-1 | none | accepted |

## Open Blockers

None.

## Approval State

- Structural completeness: complete
- Semantic review: accepted
- Human Pulse gate: Gate 2 approved
- Approval evidence: user decision 2026-08-04
`;

test('accepts a complete governance overlay without semantic claims', () => {
  const result = validateGovernanceText(VALID, 'governance.md');
  assert.equal(result.valid, true);
  assert.equal(result.structural_validation, 'pass');
  assert.equal(result.semantic_validation, 'not_performed');
  assert.equal(result.grants_approval, false);
});

test('rejects a missing required section', () => {
  const result = validateGovernanceText(VALID.replace('## Safeguards', '## Guardrails'));
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Missing required section: ## Safeguards/);
});

test('rejects a missing scope subsection', () => {
  const result = validateGovernanceText(VALID.replace('### Scope In', '### Included'));
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Missing or empty requirements subsection: ### Scope In/);
});

test('rejects unresolved template placeholders', () => {
  const result = validateGovernanceText(VALID.replace('- Feature: payments', '- Feature: <feature>'));
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Unresolved template placeholders/);
});

test('rejects duplicate operation IDs', () => {
  const duplicate = VALID.replace('## Norms', `${VALID.match(/### OP-1[\s\S]*?(?=\n## Norms)/)[0]}\n\n## Norms`);
  const result = validateGovernanceText(duplicate);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Duplicate operation ID: OP-1/);
});

test('rejects an incomplete operation contract', () => {
  const result = validateGovernanceText(VALID.replace('- Failure behavior: Return a stable decline reason\n', ''));
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /OP-1 is missing field: Failure behavior/);
});

test('rejects traceability to an unknown operation', () => {
  const result = validateGovernanceText(VALID.replace('| D1, S2 | OP-1 | Token confidentiality', '| D1, S2 | OP-9 | Token confidentiality'));
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /unknown operation: OP-9/);
});

test('keeps a structurally valid but wrong domain rule uncertified', () => {
  const result = validateGovernanceText(VALID.replaceAll('Token remains confidential', 'Tokens may be published'));
  assert.equal(result.valid, true);
  assert.equal(result.semantic_validation, 'not_performed');
  assert.equal(result.grants_approval, false);
});

test('rejects an incomplete approval state', () => {
  const result = validateGovernanceText(VALID.replace('- Approval evidence: user decision 2026-08-04\n', ''));
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Missing approval-state field: Approval evidence/);
});

test('CLI emits JSON and exits zero only for structural validity', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pulse-governance-test-'));
  const artifact = join(directory, 'governance.md');
  const cli = fileURLToPath(new URL('./validate-governance.mjs', import.meta.url));
  try {
    writeFileSync(artifact, VALID);
    const run = spawnSync(process.execPath, [cli, '--json', artifact], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(run.stdout);
    assert.equal(result.structural_validation, 'pass');
    assert.equal(result.semantic_validation, 'not_performed');
    assert.equal(result.grants_approval, false);

    writeFileSync(artifact, VALID.replace('## Traceability', '## Links'));
    const invalidRun = spawnSync(process.execPath, [cli, '--json', artifact], { encoding: 'utf8' });
    assert.equal(invalidRun.status, 1, invalidRun.stderr);
    const invalidResult = JSON.parse(invalidRun.stdout);
    assert.equal(invalidResult.structural_validation, 'fail');
    assert.equal(invalidResult.semantic_validation, 'not_performed');
    assert.equal(invalidResult.grants_approval, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
