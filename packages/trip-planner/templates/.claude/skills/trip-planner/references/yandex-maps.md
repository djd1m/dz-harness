# Yandex.Maps URL schemes (used by the generated site)

## Single point (pin) — used per stop
`https://yandex.ru/maps/?pt=<LON>,<LAT>&z=17&l=map`
- **`pt` order is LON,LAT** (longitude first). Easy to get wrong.
- Example (Казанский Кремль ≈ 55.7990 N, 49.1050 E): `...?pt=49.1050,55.7990&z=17&l=map`

## Multi-stop route — used per day ("маршрут дня одной ссылкой")
`https://yandex.ru/maps/?rtext=<LAT1>,<LON1>~<LAT2>,<LON2>~...&rtt=<mode>`
- **`rtext` order is LAT,LON** (latitude first) — OPPOSITE of `pt`. Stops separated by `~`.
- `rtt`: `auto` (car), `mt` (public transit), `pd` (pedestrian/walk).
- The renderer builds this from each day's points (in visit order) using `routeMode` (default `pd`).

## Notes
- These are plain public URLs — no API key, no SDK, work in browser + Yandex app deeplink.
- Anchor each day's route at the lodging if it makes sense (add lodging as first/last stop).
