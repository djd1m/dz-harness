# Open-Meteo weather (used by the generated site, client-side, no key)

## Endpoint (per day, per location)
`https://api.open-meteo.com/v1/forecast?latitude=<LAT>&longitude=<LON>&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&start_date=<YYYY-MM-DD>&end_date=<YYYY-MM-DD>`
- Free, no API key, CORS-open (safe to fetch from a static HTML file).
- Forecast horizon ≈ 16 days. For dates beyond that the API returns empty → the widget shows a graceful "проверьте прогноз перед выходом" fallback (no crash).

## Clothing advice (derived in-page from the response)
- tmax ≥26 жарко · 18–25 тепло · 10–17 прохладно · 2–9 холодно · <2 мороз.
- precip ≥50% OR rain weather_code → "возможен дождь — зонт/дождевик".
- snow weather_code (71/73/75/85/86) → "непромокаемая обувь".
- (tmax−tmin) ≥10 → "одевайтесь слоями".
(Implemented in `clothingAdvice()` inside site-template.html — no need to recompute; just supply day `lat/lon/date`.)

## weather_code reference (WMO): 0 ясно · 1-3 облачно · 45/48 туман · 51-67 дождь · 71-86 снег · 80-82 ливни · 95-99 гроза.
