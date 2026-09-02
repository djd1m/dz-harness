# Budget and publication

Run `size-gate.mjs --site <set-dir> --config demo-site.config.json`. Default limits are 20 MB per file,
100 MB per set, 32 seconds per clip, 240 seconds per montage, and 900 MB projected repository size.
The report is invalid after any media byte changes. `publish-demo.mjs` rechecks it before constructing
Git commands, refuses protected slug patterns, and requires `--sanction "<owner decision>"`.
For a real remote, live success requires matching index bytes plus a successful size-matched HEAD for
every MP4. On failure, execute the printed revert command instead of guessing which push arrived.
