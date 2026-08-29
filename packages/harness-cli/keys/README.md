# Trust root

`dz.pub` — the pinned Ed25519 **public** key that `dz doctor`, `dz drift-check` and `dz upgrade` fall
back to when verifying installed skill packs against their `.dz-manifest.json`.

**It is here now.** Until 2026-08-21 this directory shipped without `dz.pub` — it contained only this
README, which claimed no project key had been generated. The key had in fact existed at the repo root
since 2026-07-19. Measured with one binary run from two places on the same day:

```
$ dz doctor                        # inside the harness repo, which has its own keys/dz.pub
  signatures: 25 verified, 0 unsigned, 1 TAMPERED, 0 unverifiable; trust root: repo (keys/dz.pub)
$ dz doctor --project /tmp/consumer
  signatures: 0 verified, 0 unsigned, 0 TAMPERED, 26 unverifiable; trust root: none
```

So **every installation that relied on the packaged key** — that is, one passing no `--pubkey` and
holding no project-local `keys/dz.pub` — had a verifier that verified nothing, and said so in a
summary line that scrolls past.

## Resolution order

An explicit `--pubkey` wins; then `keys/dz.pub` inside the project being checked; then this packaged
key. A `--pubkey` that lives INSIDE the pack being verified is refused — an artifact must never supply
the key that verifies it.

## What a signature proves, and what it does not

It proves that the files **listed in that pack's `.dz-manifest.json`** still hash to the values
recorded when it was signed. It says nothing about any file the manifest does not list, nothing about
whether the skill is any good, and nothing about whether the signer deserves trust: pinning this key
decides which key is ACCEPTED, which is a different question from whether its holder is trustworthy.

## Diagnosing a `TAMPERED` verdict

`TAMPERED` means the bytes on disk disagree with the signed manifest. Before assuming modification,
check which trust root was actually used — the summary line names it, and an explicit or project-local
key takes precedence over this one, so a verdict may be reported against a key you did not intend.

Re-signing is a **publisher-side** operation, not a consumer repair: it is correct only when you own
the pack, have reviewed what changed, and are re-issuing it. The usual innocent cause is an edit made
after signing, and its remedy is procedural — sign LAST, immediately before packing. A consumer facing
`TAMPERED` should report it, not silence it.

**Never** place a private key in this directory. The signing key lives outside the repository
(`~/.dz/keys/dz.key`, mode 0600), `dz sign` refuses to write it anywhere inside the tree, and a test
asserts no private-key PEM header appears anywhere in the published tarball.
