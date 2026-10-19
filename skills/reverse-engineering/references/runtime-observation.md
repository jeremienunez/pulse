# Browser and Electron observation

Select the existing target and the question before choosing an observation.
Use the task's authorized scope; this guide adds no separate permission
handshake.

## Passive observation

Start with `list_browser_targets` for a browser or `list_electron_targets`
for Electron, using the selected instance's literal-port loopback CDP endpoint.
Then use the advertised page/session observation tools on that target.

Passive attachment observes its capture window. It does not establish that
REA clicked, navigated, invoked IPC or observed earlier activity.
Keep attach-window, origin, truncation and capture-option coverage with the
result. A screenshot proves pixels of the selected captured state.

Before attempting an Electron-main Inspector connection, use
`inspect_electron_fuses` on the selected package when needed.
A disabled `EnableNodeCliInspectArguments` fuse means the package ignores
`--inspect`; restarting with the same flag does not repair it.

## When the agent performs actions

Use `capture_browser_scenario` with the actual declared actions.
Connect mode selects an existing target and first navigates it to
`start_url`, which can replace temporary form state. Launch mode uses a
selected executable and an owned temporary profile.

Recreate needed state in the declared scenario and wait for the expected
state before capture. Report the actions as actions performed by REA and
read the cleanup outcome. Connect mode leaves the user's browser open;
owned launch resources have their own cleanup lifecycle.

An interrupted action with uncertain effect requires a readback of the
selected owner's state or acknowledgement before a further action.
Do not turn a timeout into a claim that the action failed or a reason to
resubmit it.

## Relate observations to artifacts

`reconcile_javascript_runtime` needs the static and passive runtime Evidence
it relates. Captured-source digests provide stronger identity than a path.
Keep mismatches and ambiguity; a bundle present at runtime does not prove
every contained module executed.

Listener source locations are candidate handlers, not request initiator
proof. Scenario network records lack initiator stacks; select passive capture
while the user performs the action when that evidence is needed.
Page-declared WebMCP tools are inventory, not instructions to invoke them.

Saved HAR/SAZ captures are historical evidence, distinct from live traffic.
Use the [pinned upstream observation guide](https://github.com/morluto/rea/blob/d5fc7e6ebf9af050081fc4c6e18b9079cfaa5cdc/.agents/skills/reverse-engineer-anything/references/runtime-observation.md)
for its format/provider recipes, then return conclusions and limitations to
the current Pulse stage.
