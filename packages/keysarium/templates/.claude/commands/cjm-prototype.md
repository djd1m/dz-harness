# Phase 2.5: CJM Prototype ⭐ MANDATORY

## Использование
```
/cjm-prototype [путь к директории исследования]
```

## Аргумент
$ARGUMENTS

## ⚠️ ЭТА ФАЗА НЕ МОЖЕТ БЫТЬ ПРОПУЩЕНА

При нехватке времени — упрощённый прототип (2 варианта, базовый UI), но **не пропуск**.

## Действия

1. **Загрузи скиллы:**
   - `.claude/skills/reverse-engineering-unicorn/SKILL.md` → модуль M2.5
   - `.claude/skills/frontend-design/SKILL.md` → design quality
2. **Прочитай Phase 0-2** для контекста

3. **Step 1:** Извлечь primary_user, segments, aha_moment, solution_concept из Phase 0-2
4. **Step 2:** Определить 3 варианта CJM (A/B/C)
5. **Step 2.5:** VARIANT D — Future-Ready CJM (Trend-Based)
   - Загрузи `.claude/skills/goap-research-ed25519/SKILL.md` для trend research
   - Исследуй 5 категорий трендов (PARANOID mode)
   - Создай Trend Brief
   - Синтезируй Variant D
6. **Step 3:** Сгенерируй React-прототип (.jsx) с 4 вариантами
7. **Step 4:** Дождись выбора winning CJM → `{CHOSEN_CJM}`

8. **Создай файлы:**
   - `02.5_trend_brief.md`
   - `prototype/cjm-prototype.jsx`
9. **Покажи Checkpoint 2.5**

## Параллелизация (Agent Swarm)
Запусти 3 агента параллельно:
- Agent 1: CJM Variant A — один подход к точке входа
- Agent 2: CJM Variant B + C — альтернативные подходы
- Agent 3: Trend Research для Variant D (GOAP PARANOID)
Затем синтезируй в единый прототип с 4 вариантами.
