---
name: opencode-models
description: Use when the user wants to list available OpenCode Zen or Go models, ask one model for an advisory answer, or compare two to four models through Pulse.
metadata:
  dependencies: []
---

# OpenCode Models

Use Pulse's `opencode-models` MCP server for read-only model consultation.

## Route the request

- For discovery or display, call `list_models`.
- For one model, call `ask_model`.
- For the same prompt sent to two to four models, call `compare_models` once. Do not emulate a comparison with repeated `ask_model` calls.

Preserve explicit provider prefixes and model identifiers. Pass only the bounded context the consultant needs. These tools do not grant the external model filesystem access.

## Return the result

- Listings retain the exact `opencode/` or `opencode-go/` prefixes.
- A single consultation identifies the model and preserves its answer and returned usage.
- A comparison keeps each model's result separate and surfaces individual failures instead of fabricating a response.

Treat external answers as advisory hypotheses. Verify material claims against the actual source or evidence before changing Pulse artifacts or project code.
