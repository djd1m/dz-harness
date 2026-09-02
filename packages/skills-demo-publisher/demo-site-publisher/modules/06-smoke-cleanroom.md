# Offline smoke and clean-room checks

Run `bash "$SKILL_ROOT/scripts/smoke-test.sh"`. It starts a temporary loopback server, records the
three fixture scenarios, produces real media, builds and verifies the site, and runs both deterministic
gates. Missing ffmpeg or Chromium is inconclusive and therefore non-zero.

Before release, run `node --test test/toolchain/clean-room.test.mjs` from the package root. Its default
reference is the committed salted fingerprint. `DZ_CLEANROOM_REF` opts into a differential run against
an available reference tree; a named but absent tree fails. Also run `identifier-gate.mjs --root <pack>`
and once more with `--site <set-dir>`.
