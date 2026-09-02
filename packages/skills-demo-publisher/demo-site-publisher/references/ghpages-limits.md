# GitHub Pages media limits

The executable gate intentionally stays below the host's hard ceiling: 20 MB for one generated video
and 100 MB for a set. GitHub warns when a normal repository object exceeds 50 MiB and blocks files above
100 MiB. Pages also documents a recommended source repository size of 1 GB and a ten-minute deployment
timeout. The site includes `.nojekyll` so static media bypasses Jekyll processing.

Sources (checked during the 2026-09-02 design review):

- [About large files on GitHub](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)
- [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
