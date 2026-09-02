# Montage

Run `render-cards.mjs` for introduction, section, ending, and caption images. Then run
`build-montage.mjs` with `--recording`, `--cards`, and `--out`. It normalizes every segment to H.264,
yuv420p, 30 frames per second, no audio, and checks the profile before concatenation. Long clips are
sped up to the configured bound, not cut. The command also emits SRT, Russian WebVTT, a manifest, and
optional VP9 WebM when the set configuration enables it.
