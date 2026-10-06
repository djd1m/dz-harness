# Phosphor v1: fonts and site compatibility

The factory owns semantic course presentation. A generated page uses the marker
`html[data-course-theme="phosphor-v1"]`, a dark Phosphor palette and a conservative compatibility light
palette. Light is not an approved light variant of the website. Existing JSON, locale, storage key,
scoring and default-light behavior are unchanged.

## Redistribution and provenance

The code is MIT. The unmodified font resources embedded in `scripts/course-theme.css` are SIL OFL 1.1.
Full copyright and license notices are included as `Onest-OFL.txt` and `JetBrainsMono-OFL.txt`, and in
a readable disclosure in every generated HTML file. Copying the HTML alone preserves those notices.
JetBrains Mono comes from the official 2.304 release. The four supplied Onest subsets are variable
fonts with weight axis 100–900 and retained upstream unicode ranges; the exact Google Fonts subset
revision is unknown. All font bytes are original, without modification or additional subsetting.

Original resource SHA256 values:

| Resource | SHA256 |
| --- | --- |
| JetBrainsMono-Bold-2.304.woff2 | `c503cc5ec5f8b2c7666b7ecda1adf44bd45f2e6579b2eba0fc292150416588a2` |
| JetBrainsMono-Medium-2.304.woff2 | `086c48dfbea9ddaff1320f7e09399b8e2924e88ce67453721255db3bdbb5a353` |
| JetBrainsMono-Regular-2.304.woff2 | `a9cb1cd82332b23a47e3a1239d25d13c86d16c4220695e34b243effa999f45f2` |
| gNMKW3F-SZuj7xmR-HY6EQ.woff2 | `14e7d3079b75860e2ab50efc6c318c398fdb46ede9b56e625f12ae70a3c5d9a4` |
| gNMKW3F-SZuj7xmS-HY6EQ.woff2 | `268f03691b3d06e57abcf20f9277e314ea8784298983aab5b40c1b91965027e1` |
| gNMKW3F-SZuj7xmb-HY6EQ.woff2 | `68e5e01d6265bd68967746d4f5a9d18d0e6cbb5d15583c7082d6384ab1229b27` |
| gNMKW3F-SZuj7xmf-HY.woff2 | `052df74533250c2e0ca0c4bdd32de594e107d99c1648e63820ef9c6142067828` |

The seven resources occur once each as data URLs; rendering and opening the HTML require no font
server, CDN, fetch or automatic external request. Onest handles reading text; JetBrains Mono handles
code/service text and →/✓/✗. Course-authored emoji may use the platform emoji face.

## Incumbent site and future migration

The current site unconditionally inserts its legacy course-mobile stylesheet before `</head>`.
The factory marker alone does not retire it. Marker-scoped semantic rules preserve the factory palette,
mobile type sizes and opened achievements, including the legacy `body aside .ach-grid` hiding rule.
The literal `<body>`, layout, empty main shell, footer separators, embedded JSON IDs, final runtime
position and `go`/`SECTIONS`/`view` globals remain available to the existing site's string consumers.
Standalone pages have no new native hash router; the site retains its own wrapper.

A later site change can detect the marker and remove only generic course rules superseded by the
factory theme. Keep quickstart/next/footer/workshop inserts, static citations, SEO, hash routing,
analytics and widgets under site ownership. Before deployment, the site owner must run relink twice
and validate idempotence, hash/history navigation, citation IDs, SEO and every augmented surface.
Factory tests against a pinned overlay prove that consumer version only. They do not establish
production migration readiness or authorize deployment.
