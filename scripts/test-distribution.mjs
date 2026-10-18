#!/usr/bin/env node

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const readJson = (relative) => JSON.parse(fs.readFileSync(new URL(relative, root), "utf8"));
const repository = "https://github.com/jeremienunez/pulse";

test("both native manifests and marketplaces distribute the Tuned fork without changing plugin identity", () => {
  const codex = readJson(".codex-plugin/plugin.json");
  const claude = readJson(".claude-plugin/plugin.json");
  const codexCatalog = readJson(".agents/plugins/marketplace.json");
  const claudeCatalog = readJson(".claude-plugin/marketplace.json");
  for (const manifest of [codex, claude]) {
    assert.equal(manifest.name, "pulse");
    assert.equal(manifest.repository, repository);
    assert.equal(manifest.homepage, `${repository}/tree/tuned/main`);
    assert.equal(manifest.author.name, "quanpersie2001");
  }
  assert.equal(codex.interface.websiteURL, `${repository}/tree/tuned/main`);
  for (const catalog of [codexCatalog, claudeCatalog]) {
    assert.equal(catalog.name, "pulse-dev");
    assert.equal(catalog.plugins.find((plugin) => plugin.name === "pulse").version, codex.version);
  }
  assert.deepEqual(codexCatalog.plugins.find((plugin) => plugin.name === "pulse").source, {
    source: "url", url: `${repository}.git`, ref: "tuned/main",
  });
  assert.equal(claudeCatalog.plugins.find((plugin) => plugin.name === "pulse").source, "./");
});

test("documented install commands select the fork branch and actual marketplace key", () => {
  const readme = fs.readFileSync(fileURLToPath(new URL("README.md", root)), "utf8");
  assert.match(readme, /git clone --branch tuned\/main --single-branch https:\/\/github\.com\/jeremienunez\/pulse\.git pulse-tuned/);
  assert.match(readme, /claude plugin marketplace add "\$PWD"/);
  assert.match(readme, /claude plugin install pulse@pulse-dev --scope user/);
  assert.match(readme, /codex plugin marketplace add jeremienunez\/pulse --ref tuned\/main/);
  assert.match(readme, /codex plugin add pulse@pulse-dev/);
  assert.doesNotMatch(readme, /(?:marketplace add|plugin install) (?:quanpersie2001\/pulse|pulse@pulse\s)/);
});
