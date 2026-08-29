# Itinerary JSON schema

The object below replaces `__ITINERARY_JSON__` in `site-template.html`.

```json
{
  "trip": {
    "title": "Казань за 3 дня с ребёнком",
    "eyebrow": "Семейный маршрут",
    "city": "Казань",
    "start": "2026-07-10",
    "end": "2026-07-12",
    "partyLabel": "2 взрослых + ребёнок 5 лет",
    "constraints": ["вегетарианцы", "не пьём алкоголь", "до 4000 ₽/день"],
    "lodging": {
      "name": "Отель на Баумана",
      "address": "ул. Баумана, 1",
      "lat": 55.7965,
      "lon": 49.1064
    },
    "arrival": "10 июля, 10:30, поезд из Москвы",
    "departure": "12 июля, 21:00, самолёт",
    "logistics": [
      { "label": "Прибытие", "value": "10:30 · поезд", "note": "первый пункт после 12:00" },
      { "label": "Жильё", "value": "ул. Баумана, 1", "note": "старт и финиш маршрутов" },
      { "label": "Отъезд", "value": "21:00 · самолёт", "note": "выезд в аэропорт в 17:00" }
    ],
    "snapshotDate": "2026-08-18",
    "disclaimer": "Контакты, отзывы, часы и цены проверены на дату снимка. Перепроверьте перед поездкой."
  },
  "days": [
    {
      "date": "2026-07-10",
      "short": "10 июл",
      "title": "Кремль и старый город",
      "summary": "Мягкий старт после поезда: одна большая точка, прогулка и ранний ужин.",
      "budget": "до 3500 ₽ без трансфера",
      "lat": 55.7963,
      "lon": 49.1088,
      "routeMode": "pd",
      "climate": {
        "label": "Ориентир для июля, не прогноз",
        "temperature": "+18…+26 °C",
        "advice": "Лёгкая одежда, вода и тонкий дождевик."
      },
      "points": [
        {
          "time": "13:00",
          "title": "Казанский Кремль",
          "category": "экскурсия",
          "venue": true,
          "lat": 55.7990,
          "lon": 49.1050,
          "desc": "Территория ЮНЕСКО, мечеть Кул-Шариф и башня Сююмбике.",
          "duration": "2 часа",
          "cost": "территория бесплатно; музеи отдельно",
          "booking": { "required": false },
          "tips": "Утром и после 16:00 обычно спокойнее.",
          "contacts": {
            "address": "Казань, Кремль",
            "phone": "+7 843 567-80-16",
            "website": "https://kazan-kremlin.ru/"
          },
          "reviews": {
            "source": "Яндекс Карты",
            "url": "https://yandex.ru/maps/?text=Казанский%20Кремль",
            "checked": "2026-08-18",
            "summary": "Посетители хвалят масштаб комплекса; часто советуют закладывать несколько часов."
          }
        },
        {
          "time": "16:00",
          "title": "Улица Баумана",
          "category": "прогулка",
          "venue": false,
          "lat": 55.7905,
          "lon": 49.1125,
          "desc": "Пешеходная ось центра без обязательного входа в заведение.",
          "cost": "бесплатно",
          "booking": { "required": false },
          "tips": "Сократите прогулку, если ребёнок устал."
        }
      ]
    }
  ]
}
```

## Hard rules

- `lat`/`lon` are required for every point so the map pin works. If they cannot be verified, set
  both to `null` and state `координаты уточняются` in `tips`; never invent them.
- Set `venue: true` for a named establishment or operated attraction: museum, café, restaurant,
  theatre, visitor centre, ticketed attraction, and similar. Use `venue: false` only for public
  walks/squares/viewpoints, transport legs, lodging/transfer steps, or genuinely generic stops.
- Every `venue: true` point requires `contacts.address` and at least one verified official contact:
  `contacts.website` or `contacts.phone`.
- Every `venue: true` point requires `reviews.source`, `reviews.url`, and ISO `reviews.checked`.
  `reviews.url` must point to a review/listing page separate from the official contact page.
- `reviews.rating` and `reviews.count` are optional. Include them only when the cited review page
  displays those exact values. Never infer, average, round, or copy a stale number without its date.
- `reviews.summary` must attribute decision-relevant patterns to visitors/reviewers, not state them
  as verified facts.
- `booking.required: true` requires a real HTTPS `booking.url` and renders “Купить билет”.
- Every café/restaurant must satisfy the hard trip constraints. State the relevant menu, child,
  alcohol-focus, and budget evidence in `desc` or `tips`.
- Day 1 starts after `arrival`; the last day ends before `departure` with transfer buffer.
- For historical/demo dates, use an explicit `climate` block labelled as an orientation, never as
  a live forecast. For future dates, omit it and let the Open-Meteo widget load/fallback honestly.
