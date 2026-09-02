# @dzhechkov/skills-demo-publisher

An installable skill pack for repeatable product recordings and static GitHub Pages demo sites. JSON
scenarios drive headless Chromium; ffmpeg produces a constrained H.264 MP4; the renderer emits an index,
one page per demo, subtitles, and transcripts. Public delivery is fail-closed on size, confidentiality,
and live-byte verification.

## End-to-end example

Prerequisites:

```bash
apt install ffmpeg
npm install
npx playwright install chromium
```

Copy `demo-site-publisher/references/example-demo.json` to `demo.json`, create
`demo-site.config.json` from its schema, start the product locally, then run:

```bash
SKILL_ROOT="$PWD/demo-site-publisher"
node "$SKILL_ROOT/scripts/preflight.mjs"
node "$SKILL_ROOT/scripts/record-demo.mjs" --demo demo.json --config demo-site.config.json --out out/recording --offline
node "$SKILL_ROOT/scripts/render-cards.mjs" --demo demo.json --config demo-site.config.json --out out/cards
node "$SKILL_ROOT/scripts/build-montage.mjs" --demo demo.json --config demo-site.config.json --recording out/recording --cards out/cards --out out/montage
node "$SKILL_ROOT/scripts/render-site.mjs" --demo demo.json --config demo-site.config.json --montage out/montage --out out/demo-site
node "$SKILL_ROOT/scripts/size-gate.mjs" --site out/demo-site/my-set --config demo-site.config.json
```

Expected output includes named positive receipts for preflight, scenarios, montage, site validity, and
the byte budget. The resulting set is self-contained except for files under its own `video/` directory.
Run `npm test` for the portable unit lane and `npm run test:toolchain` for real media/browser checks.
Publishing requires an owner decision and is deliberately not part of the example.

## Русский

Пак записывает продуктовые сценарии локальным Chromium, показывает курсор и клики, сохраняет кадры
каждого шага и собирает видео с русскими подписями. На выходе — статический сайт: оглавление, отдельная
страница демонстрации, MP4, необязательный WebM и VTT. Демо-страницы работают без JavaScript и внешних
ресурсов. Перед публикацией обязательны лимит размера, проверка закрытых областей, санкция владельца и
положительная квитанция GitHub Pages по фактическим байтам страницы и видео.

`npm publish` для этого пакета не выполняется в рамках данной функции.
