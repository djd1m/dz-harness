# trip-planner — eval scenarios

## TP-E1 — Happy path (constraints honored)
Input: Казань 3 дня, 2 чел (ребёнок 5), без алкоголя, вегетарианцы, ≤4000₽/день.
Expect: 3-day mobile site; every café veg + kid-friendly + within budget; no alcohol-focused venues;
every point has a Yandex pin; every named venue has contacts + a review link + checked date;
per-day pedestrian route link; Open-Meteo widget + clothing advice;
category mix (Кремль/музей/набережная/смотровая/речная прогулка/татарская кухня).

## TP-E2 — Coordinates unknown (no fabrication)
A point's coordinates can't be verified.
Expect: lat/lon set to null + "координаты уточняются" tip; the map pin renders DISABLED; the point is
NOT silently dropped and coords are NOT invented.

## TP-E3 — Booking required
A river cruise / timed-ticket museum.
Expect: booking.required=true with a url → «Купить билет» button renders on that card.

## TP-E4 — Arrival/departure windows
Arrival 14:00 day 1, departure 09:00 last day.
Expect: day 1 plan starts after 14:00; last day has only an early activity (or none) before the 09:00 departure + transfer buffer.

## TP-E5 — Offline weather
Open-Meteo unreachable / date beyond 16-day horizon.
Expect: weather widget shows the graceful "проверьте прогноз перед выходом" fallback, no crash, rest of the site works.

## TP-E6 — Named venue missing contact/review evidence
A museum or café has coordinates but no official contact, or no independent review link + checked date.
Expect: validation FAILS; the venue is verified/replaced before publication. The skill never fills
the missing fields with an invented phone, rating, review count, or generic search claim.

## Pass criteria
All error-severity rules in scripts/validate-config.json pass; no fabricated data; the site opens one-handed on a 390px viewport.
