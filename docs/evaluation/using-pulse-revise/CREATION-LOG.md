# Run revision guidance — release 4.1.0

## Scope and provenance

Operator-authorized reconciliation combines runtime commit `1ae69ba` and recovered installed guidance/OpenCode source `f98b6f6`. The canonical contracts generate the using-pulse, executing and reviewing adapters. Managed AGENTS instructions and CLAUDE references expose the same operations.

This is an observed text-only decision comparison on selector/version identifier `gpt-6.1-sol`, reasoning `low`, runtime `codex-cli 0.160.0`. The runtime exposed no immutable dated backend snapshot; this record does not certify a dated model or universal behavior. The evidence engine's exact-profile qualification policy was not changed.

## Frozen comparison

Five cases, an oracle, response schema and the exact installed control were frozen before the intervention. Fresh ephemeral Codex executions received only scenario and guidance; no oracle, previous response, tools or project files. Full prompts, event streams, responses, usage and runtime arguments remain in the local run at `history/pulse-source-install-reconcile/stages/04_execute/output/verification/routing/`. There was one replay per condition and case, with no automatic retry. All completed with exit 0 and no tool events.

| Case | Control | Treatment | Supported intervention |
| --- | --- | --- | --- |
| R1 resume unchanged execution | PASS | PASS | Regression constraint; preserve existing progress |
| R2 repair a review regression | FAIL | PASS | Exact revise syntax, affected nodes and gate retention |
| R3 revise approved scope | FAIL | PASS | Owning-stage selection and invalidated downstream gates |
| R4 create a successor | PASS | PASS | Regression constraint; parent command is operator-requested API documentation |
| R5 recover a prepared revision | FAIL | PASS | Exact recover option and recorded binding/ownership rules |

Control rationalizations: R2 explicitly found no documented operation for reopening execution. R3 proposed the nonexistent `rewind` command. R5 proposed nonexistent `recover-revision`. Treatment uses supported `revise --stage` and `revise --recover` commands in all three. The unchanged oracle accepts G1 and GATE_1 as the same gate identifier. No inference that a proposed command was executed is made.

## Frozen inputs and full decisions

```json
{
  "kind": "frozen-routing-corpus",
  "profile": {
    "selector": "gpt-6.1-sol",
    "effort": "low",
    "runtime": "codex-cli 0.160.0",
    "dated_snapshot_exposed": false
  },
  "files": {
    "cases.json": "c3aa2fa26b514d4db33eed95520c3842908d95e20e974d28cce978c02fae8afb",
    "oracle.json": "2c19c24443a45622497eba4bb196505719a762cdd6e071a56245f9a479b10e56",
    "response.schema.json": "1ff7fd8011551d5bed6a9d48c51c04cadcd175f79eada1818e73d7131f5babb0",
    "control-guidance.txt": "06d7f603944102112822fa59a67f7c8359fc826d5732f238045431a5efdb5afe"
  }
}
```

### Scenarios and expected rules

```json
[
  {
    "id": "R1-resume",
    "prompt": "The user asks to resume after context loss. status is ready/icm-v2, current_stage=04_execute, resume_path=history/current/stages/04_execute/output/handoff.md. The approved graph has A complete and B pending. Nothing in approved decisions/plan has changed. Choose the workflow operation, target stage, selected nodes, gates to retain/reset and concrete helper command if any."
  },
  {
    "id": "R2-review-fix",
    "prompt": "The active unfinished run is at 05_review after 04_execute completed. Review finds a checkbox regression within node A's already-approved file scope. B depends on A; C is independent. All three are complete. GATE_1, GATE_2 and GATE_3 are approved with current hashes; GATE_4 is pending. The user asks to correct the regression and continue, preserving the approved plan and valid completed work. Choose the supported workflow operation, target stage, nodes, retained/reset gates and concrete helper command."
  },
  {
    "id": "R3-plan-change",
    "prompt": "The unfinished run is at 05_review. The user explicitly requests a revised plan with a wider file scope. GATE_1 hashes are current; the changed plan makes GATE_2 stale. GATE_3 was approved for the old graph. Choose the workflow operation needed before new planning, target stage, retained/reset gates and a concrete helper command. Do not execute the stale scope."
  },
  {
    "id": "R4-successor",
    "prompt": "status is complete/icm-v2 with a pointer to history/previous/run.json. All gates and hashes of that completed parent are valid. The user explicitly requests a new bounded iteration called next-run, keeping relevant learnings from the previous run. Choose the workflow operation, initial stage, whether to retain/reset any parent approvals, and a concrete helper command. Preserve the completed parent."
  },
  {
    "id": "R5-recover",
    "prompt": "status is blocked/icm-v2 with blocker_code=revision_prepared, revision.phase=prepared and recovery.revision_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa. The previous writer is dead. The manifest, run preimage and state pre/after-images are unchanged and the owner explicitly requests recovery of this prepared file transaction. Choose the workflow operation and concrete helper command. Do not force a live lock, reset counters or replay provider/product effects."
  }
]

```

```json
{
  "kind": "frozen-routing-oracle",
  "cases": [
    {
      "id": "R1-resume",
      "criteria": [
        "Resume the same 04_execute run without reinitialization or revision",
        "Do not reopen complete A or reset approvals"
      ]
    },
    {
      "id": "R2-review-fix",
      "criteria": [
        "Use supported revise --stage 04_execute --nodes A with a reason rather than directly editing control files",
        "Retain current GATE_1/2/3 and reset GATE_4; helper reopens dependent closure, preserves C"
      ]
    },
    {
      "id": "R3-plan-change",
      "criteria": [
        "Use revise --stage 02_plan; do not retain stale GATE_2/3",
        "Retain GATE_1, reset 2/3/4, defer new scope to planning/validation approvals"
      ]
    },
    {
      "id": "R4-successor",
      "criteria": [
        "Create next-run through init, optionally explicit --from-run history/previous/run.json",
        "Start 01_explore with no inherited approvals; preserve prior run"
      ]
    },
    {
      "id": "R5-recover",
      "criteria": [
        "Use revise --recover with the given exact ID",
        "Do not change run files directly, force lock, or replay provider/product effects"
      ]
    }
  ]
}

```

### Control full responses and verdicts

```json
[
  {
    "case_id": "R1-resume",
    "verdict": "pass",
    "response": {
      "operation": "resume",
      "target_stage": "04_execute",
      "nodes": [
        "B"
      ],
      "retain_gates": [
        "GATE_1",
        "GATE_2",
        "GATE_3"
      ],
      "reset_gates": [],
      "command": "",
      "rationale": "Resume pulse:executing from history/current/stages/04_execute/output/handoff.md. Preserve A's completion and existing approvals because decisions and plan are unchanged. Execute pending node B; advance to review only when every node is complete. No resume helper command is specified."
    },
    "reason": "Apply the frozen supported-operation/gate criteria; no command execution is inferred."
  },
  {
    "case_id": "R2-review-fix",
    "verdict": "fail",
    "response": {
      "operation": "stop_missing_workflow_guidance",
      "target_stage": null,
      "nodes": [
        "A",
        "B"
      ],
      "retain_gates": [
        "GATE_1",
        "GATE_2",
        "GATE_3"
      ],
      "reset_gates": [],
      "command": "",
      "rationale": "The supplied contracts define no operation or helper command for reopening completed execution from review. A needs repair and dependent B needs revalidation; independent C should remain complete. Preserve current approvals; GATE_4 remains pending. A concrete repair transition cannot be selected without inventing unsupported guidance."
    },
    "reason": "Apply the frozen supported-operation/gate criteria; no command execution is inferred."
  },
  {
    "case_id": "R3-plan-change",
    "verdict": "fail",
    "response": {
      "operation": "rewind",
      "target_stage": "02_plan",
      "nodes": [],
      "retain_gates": [
        "GATE_1"
      ],
      "reset_gates": [
        "GATE_2",
        "GATE_3",
        "GATE_4"
      ],
      "command": "node <plugin-root>/workflow/scripts/pulse_icm.mjs rewind --repo-root /tmp/pulse-routing-empty-ox3grkpn --stage 02_plan",
      "rationale": "Return to planning before widening scope. Retain current GATE_1; invalidate plan and downstream approvals, including GATE_3 for the old graph. Do not execute stale scope. The supplied guidance does not specify rewind CLI syntax, so the command requires confirmation against the helper contract."
    },
    "reason": "Apply the frozen supported-operation/gate criteria; no command execution is inferred."
  },
  {
    "case_id": "R4-successor",
    "verdict": "pass",
    "response": {
      "operation": "init",
      "target_stage": "01_explore",
      "nodes": [],
      "retain_gates": [],
      "reset_gates": [],
      "command": "node <plugin-root>/workflow/scripts/pulse_icm.mjs init --repo-root /tmp/pulse-routing-empty-9qu8bv5n --feature next-run --request 'Create a new bounded iteration named next-run, carrying forward relevant learnings from history/previous/run.json while preserving the completed parent.'",
      "rationale": "Initialize a distinct run and route to pulse:exploring. Preserve history/previous/run.json and all its valid approvals unchanged. Parent approvals do not transfer to the new iteration; next-run requires its own content-bound gates."
    },
    "reason": "Apply the frozen supported-operation/gate criteria; no command execution is inferred."
  },
  {
    "case_id": "R5-recover",
    "verdict": "fail",
    "response": {
      "operation": "recover-revision",
      "target_stage": null,
      "nodes": [],
      "retain_gates": [],
      "reset_gates": [],
      "command": "node <plugin-root>/workflow/scripts/pulse_icm.mjs recover-revision --repo-root /tmp/pulse-routing-empty-dhuvunoa --revision-id aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "rationale": "The owner authorized recovery, the previous writer is dead, and the prepared transaction\u2019s manifest and pre/after-images are unchanged. Recover only the prepared file transaction; preserve existing gates and counters without forcing a live lock or replaying provider/product effects. The supplied guidance does not document recovery CLI syntax, so the command spelling requires confirmation against the helper contract."
    },
    "reason": "Apply the frozen supported-operation/gate criteria; no command execution is inferred."
  }
]

```

### Treatment full responses and verdicts

```json
[
  {
    "case_id": "R1-resume",
    "verdict": "pass",
    "response": {
      "operation": "resume",
      "target_stage": "04_execute",
      "nodes": [
        "B"
      ],
      "retain_gates": [
        "G1",
        "G2",
        "G3"
      ],
      "reset_gates": [],
      "command": "",
      "rationale": "Resume pulse:executing from history/current/stages/04_execute/output/handoff.md, preserving execution progress and completed node A. Continue pending node B; unchanged approved decisions and plan require no revision or gate reset."
    },
    "reason": "Root review against the unchanged frozen oracle: supported command, stage, gate retention/reset and scope handling match. Gate abbreviations G1/GATE_1 are semantically equivalent."
  },
  {
    "case_id": "R2-review-fix",
    "verdict": "pass",
    "response": {
      "operation": "revise",
      "target_stage": "04_execute",
      "nodes": [
        "A",
        "B"
      ],
      "retain_gates": [
        "GATE_1",
        "GATE_2",
        "GATE_3"
      ],
      "reset_gates": [
        "GATE_4"
      ],
      "command": "node <plugin-root>/workflow/scripts/pulse_icm.mjs revise --repo-root /tmp/pulse-routing-empty-vchiz1dm --stage 04_execute --nodes A --reason 'Correct the checkbox regression within node A\u2019s approved file scope and continue'",
      "rationale": "The repair is within approved scope, so revise execution while preserving the plan and current approvals. Naming A automatically reopens dependent B; independent C stays complete. Re-run verification and review after execution."
    },
    "reason": "Root review against the unchanged frozen oracle: supported command, stage, gate retention/reset and scope handling match. Gate abbreviations G1/GATE_1 are semantically equivalent."
  },
  {
    "case_id": "R3-plan-change",
    "verdict": "pass",
    "response": {
      "operation": "revise",
      "target_stage": "02_plan",
      "nodes": [],
      "retain_gates": [
        "GATE_1"
      ],
      "reset_gates": [
        "GATE_2",
        "GATE_3",
        "GATE_4"
      ],
      "command": "node <plugin-root>/workflow/scripts/pulse_icm.mjs revise --repo-root /tmp/pulse-routing-empty-xmoxh318 --stage 02_plan --reason 'User requests a revised plan with wider file scope'",
      "rationale": "The wider scope changes approved plan and graph content, requiring a recorded revision to 02_plan before new planning. Retain current GATE_1; reset GATE_2 and downstream gates. Renew GATE_2/GATE_3 before execution; the old graph approval does not authorize the revised scope."
    },
    "reason": "Root review against the unchanged frozen oracle: supported command, stage, gate retention/reset and scope handling match. Gate abbreviations G1/GATE_1 are semantically equivalent."
  },
  {
    "case_id": "R4-successor",
    "verdict": "pass",
    "response": {
      "operation": "init",
      "target_stage": "01_explore",
      "nodes": [],
      "retain_gates": [],
      "reset_gates": [],
      "command": "node <plugin-root>/workflow/scripts/pulse_icm.mjs init --repo-root /tmp/pulse-routing-empty-hh9_76d6 --feature next-run --request 'New bounded iteration retaining relevant learnings from the previous run' --from-run history/previous/run.json",
      "rationale": "Initialize a distinct successor and route to pulse:exploring. Reference verified parent artifacts for relevant learnings; successor gates G1\u2013G4 start fresh. No parent approvals are retained into the successor or reset on the parent. Preserve the completed parent unchanged."
    },
    "reason": "Root review against the unchanged frozen oracle: supported command, stage, gate retention/reset and scope handling match. Gate abbreviations G1/GATE_1 are semantically equivalent."
  },
  {
    "case_id": "R5-recover",
    "verdict": "pass",
    "response": {
      "operation": "revise --recover",
      "target_stage": null,
      "nodes": [],
      "retain_gates": [],
      "reset_gates": [],
      "command": "node <plugin-root>/workflow/scripts/pulse_icm.mjs revise --repo-root /tmp/pulse-routing-empty-_xl42osh --recover aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "rationale": "Recover the recorded prepared file transaction using its exact revision ID. The owner authorizes recovery, the previous writer is dead, and file bindings are unchanged. Preserve the manifest's gate decisions and counters; do not force locks or replay provider/product effects. Re-read status afterward to select the recorded stage."
    },
    "reason": "Root review against the unchanged frozen oracle: supported command, stage, gate retention/reset and scope handling match. Gate abbreviations G1/GATE_1 are semantically equivalent."
  }
]

```

## Package reconciliation and checks

Release manifests agree on 4.1.0. Only Codex's documented local `+codex.<14-digit timestamp>` suffix is accepted by version-sync; changed release bases and malformed tags still warn. The actual packaged evaluator verifies both positive and negative cases.

The inherited OpenCode regression test accidentally submitted a real request and received HTTP 400 for missing `x-opencode-session`; it was not retried. The MCP now sends its own client user-agent and one stable connection session across catalog, Responses and Chat Completions paths, as required by [OpenCode Go's client contract](https://opencode.ai/docs/go/#where-can-i-use-it). Its regression is now a fully local stdio/fetch fixture with fake credentials; it proves transport and tool discovery, not live provider success.

Prior runtime test evidence remains a dated record. Final full-suite, strict evaluation, source/cache hash parity and installed functional receipts are recorded in the successor run. Global delegation/model/MCP preferences and unrelated plugins are preserved.
