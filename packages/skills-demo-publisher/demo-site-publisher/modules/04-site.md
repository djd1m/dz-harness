# Static site

`render-site.mjs` creates `<set>/index.html`, `<set>/<slug>/index.html`, and `<set>/video/` assets.
Demo pages contain native `<video>` markup, an enabled Russian subtitle track, an inline stylesheet,
and a text transcript. They contain no JavaScript and load nothing from the network. The verifier
rejects external references, malformed page structure, and dangling media paths. Rebuilding identical
non-video inputs must produce identical HTML, subtitle, and manifest bytes.
