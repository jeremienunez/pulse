const core = [
  "workflow/scripts/test_pulse_icm.mjs",
  "workflow/scripts/test_workflow_contracts.mjs",
  "skills/using-pulse/scripts/test_onboard_pulse.mjs",
  "skills/governed-feature/scripts/test-validate-governance.mjs",
  "scripts/test-pulse-quality.mjs",
  "scripts/test-install-git-hooks.mjs",
];
const packages = [
  "scripts/test-build-plugin-dist.mjs", "scripts/test-build-antigravity-dist.mjs",
  "scripts/test-install-cli-bridge.mjs", "scripts/test-bump-version.mjs", "scripts/test-distribution.mjs",
];
const evidence = [
  "scripts/test-pulse-skill-evidence.mjs", "scripts/test-pulse-skill-action-evidence.mjs",
  "scripts/test-pulse-skill-iteration.mjs", "scripts/test-pulse-plugin-eval.mjs",
];

export function qualityChecks(profile, entries) {
  if (!["commit", "ci"].includes(profile)) throw new Error("Profile must be commit or ci.");
  const node = (id, args) => ({ id, command: process.execPath, args });
  const syntax = entries.filter(entry => /\.[cm]?js$/u.test(entry.path))
    .map(entry => node(`syntax:${entry.path}`, ["--check", entry.path]));
  return [
    ...syntax,
    node("static-contracts", ["scripts/pulse-plugin-eval.mjs", "run", "--skip-runtime", "--skip-scenarios", "--strict"]),
    { id: "markdown-links", command: "bash", args: ["scripts/check-markdown-links.sh"] },
    node("core-contracts", ["--test", ...core]),
    ...(profile === "ci" ? [node("packages", ["--test", ...packages]), node("evidence", ["--test", ...evidence])] : []),
  ];
}
