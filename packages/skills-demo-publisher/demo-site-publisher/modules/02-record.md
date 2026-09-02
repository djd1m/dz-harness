# Record

The recorder opens a new browser context for every scenario at 1280×800. It installs a visible pointer
and click ripple, captures a PNG after each action, and writes `recording-manifest.json`. Use `--offline`
for the deterministic gate: only loopback navigation is accepted and Chromium receives a closed proxy.
If a selector is missing, the scenario is marked `error`; no successful entry may be emitted for it.
