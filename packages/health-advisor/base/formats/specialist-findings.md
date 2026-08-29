# Emit contract — `ha-finding-1` (специалист → lane file)

Контракт, который получает КАЖДЫЙ специалист консилиума. Специалист пишет ровно один файл:
`lanes/<specialty>.findings.json` — структурный JSON по схеме `ha-finding-1`. Прозой не отвечать:
непарсящийся ответ становится ИМЕНОВАННЫМ упавшим специалистом (`LaneFailure`), не молчаливым
пропуском (INV-2).

## Схема (обязательные ключи)

```json
{
  "schema": "ha-finding-1",
  "lane": {
    "lane_id": "L2",
    "specialty": "clinical-pharmacology",
    "run_id": "run-1",
    "skills": ["tooluniverse-drug-drug-interaction", "clinpgx", "drug-interaction-checker"],
    "dedicated_skill": true,
    "verification_mode": "paranoid"
  },
  "lane_outcome": { "status": "produced" },
  "findings": [{
    "finding_id": "clinical-pharmacology:7c41ab90e2d5",
    "claim": "Комбинация X + Y повышает экспозицию X; обсудить с врачом снижение дозы.",
    "claim_kind": "recommendation",
    "quoted_values": [
      { "ref": "qv1", "analyte": "ЛПНП", "value": "4.9", "unit": "ммоль/л",
        "observed_on": "2026-07-14", "source": "profile.json#labs[3]" }
    ],
    "dose": { "ref": "dose1", "agent": "X", "amount": "10", "unit": "мг", "frequency": "1×/сут" },
    "population": { "ref": "pop1", "description": "мужчины 40-60, СКФ>60",
                    "match": "partial", "axes_diverging": ["СКФ"] },
    "evidence": { "level": 2, "provenance": "FETCH_VERIFIED",
                  "sources": ["PMID 30153967"], "fetch_date": "2026-08-11" },
    "caveats": [{
      "caveat_id": "clinical-pharmacology:7c41ab90e2d5:c1",
      "type": "population_scope",
      "text": "исследование не включало пациентов с СКФ<60",
      "applies_to": { "claim": true, "quoted_values": [], "dose": "dose1",
                      "population": "pop1", "timeframe": null, "evidence_scope": "level-2-only" },
      "severity_if_dropped": "material"
    }],
    "unknowns": ["Lp(a) не измерен"],
    "severity": "major",
    "recommendation_eligible": true
  }]
}
```

## Правила (нарушение любого = schema_invalid, весь lane падает ИМЕНОВАННО)

1. **`finding_id` пересчитываем из содержимого** (`lib/consult-finding-id.js`): sha256 по
   структурно-нормализованным частям (claim, claim_kind, quoted_values, dose, population), первые
   12 hex, с префиксом специальности. Не выдумывайте id — выведите его; гейт пересчитает и
   сверит (расхождение = `id_not_derivable`).
2. **`caveats` — ОБЯЗАТЕЛЬНЫЙ ключ** (INV-3). Пустой `[]` допустим только для
   `claim_kind: "observation"`. Интерпретация или рекомендация без единой оговорки — schema error.
3. **Каждая оговорка ПРИВЯЗАНА** (INV-4): `applies_to` должен указывать хотя бы на один
   true/non-null член (claim / ref значения / ref дозы / ref популяции / timeframe /
   evidence_scope). «Декоративная» оговорка без привязки — schema error.
4. **`severity_if_dropped`**: `material` — потеря оговорки меняет клинический смысл;
   `informational` — не меняет. Гейт считает recall по material-связкам.
5. **`quoted_values`**: `value` и `unit` — ДВА отдельных строковых поля, байт-в-байт как в
   профиле пациента. Синтез обязан байт-совпадать с ними — не округляйте на входе.
6. **Типы оговорок**: пол реестра — `FRESHNESS_UNKNOWN`, `conditions_unknown`, `GRADE`,
   `study_population`, `source_disclaimer`, `dose_scope`, `population_scope`, `timeframe_scope`,
   `contraindication_scope`, `measurement_context`
   (+ добавления из `lib/registry/caveat-types.json`; реестр только ДОБАВЛЯЕТ).
   Противопоказание типизируйте `contraindication_scope`, условие измерения («только натощак») —
   `measurement_context`: оба типа материальны ПО ТИПУ, свободный текст этой защиты не имеет.
7. **`lane.run_id`** — если хост назвал id прогона, впишите его БАЙТ-В-БАЙТ: гейт с `--run-id`
   отвергает файл с другим (или отсутствующим) `run_id` как именованный `run_mismatch`
   (защита от устаревших/подложенных файлов другого прогона).
8. **`quoted_values[].source_anchor`** (v1.8.0, НЕОБЯЗАТЕЛЬНО) — структурированный, ВАЛИДИРУЕМЫЙ
   якорь на первичку: `{schema:"ha-source-anchor-1", entry_id, path, sha256[, archive_id,
   ingested_at]}` — адрес строки `sources/manifest.json`, резолвится обратно в байты с пересчётом
   sha256. Чеканить ТОЛЬКО через `lib/source-anchor-store.js` `stampFromManifest()` — вручную
   собранный якорь отвергается (`entry_id` пересчитывается из `(path, sha256)`), путь берётся из
   строки каталога ДОСЛОВНО, абсолютный путь — отказ, содержимое/источник загрузки внутрь якоря не
   кладутся никогда.

   **Это НЕ то же самое, что поле `source` в примере выше** (`"source": "profile.json#labs[3]"`).
   `source` — существующая, НЕформальная, невалидируемая строка-указатель: схема её не проверяет,
   гейт по ней ничего не решает, и этот слайс её не трогает. Два поля могут стоять рядом на одном
   `quoted_values[]`-элементе, они не взаимозаменяемы, и переименовывать одно в другое НЕЛЬЗЯ.
   Правило простое: `source` говорит «откуда в НАШЕМ профиле», `source_anchor` — «из какого
   ПЕРВИЧНОГО документа, и он всё ещё тот же».

## Форма отказа (refusal shape)

Специалист, который НЕ МОЖЕТ ответить (вопрос вне компетенции, данных недостаточно), пишет
валидную запись, не свободную прозу:

```json
{
  "schema": "ha-finding-1",
  "lane": { "lane_id": "L3", "specialty": "nephrology" },
  "lane_outcome": { "status": "refused", "reason": "данных о функции почек в профиле нет" },
  "findings": []
}
```

Это станет именованным `LaneFailure{refusal}` — честный отказ, раскрытый в синтезе. Молчание или
проза вместо файла станут `missing`/`unparsable` — тоже именованными. Тихого пропуска не существует.
