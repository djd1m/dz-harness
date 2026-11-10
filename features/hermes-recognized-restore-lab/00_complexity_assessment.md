# Оценка сложности

Task kind: feature. Tier: L (оценка ведущего: migration, durability и authority). Режим: feature-adr Reference, plain. Область кода ограничена четырьмя файлами лаборатории, но решение пересекает trust boundary export, identity установленного runtime/core и durable состояние двух хранилищ. Ни одно production API не меняется.

| Acid | Сценарий отказа |
| --- | --- |
| A1 | Подмена descriptor/key/export или смешанная эпоха отказывает до target write. |
| A2 | Копия старого tuple/receipt на новый inode не становится новой рабочей квитанцией. |
| A3 | Неверный runtime, чужой/нечистый target или изменённый source отказывает до intent/save. |
| A4 | Crash после `attempting`, включая core rename до fsync, не вызывает blind retry и не выдаёт ложный durable commit. |
| A5 | Partial/unknown/stale seal не выдаёт готовый batch и не активирует gateway/index. |
| A6 | Два claim либо mapping collision/tamper не создают две интерпретации операции. |

Статус: precode design. K1/K2, независимая проверка дизайна, Step 8/9 и runtime tests пока не выполнялись. Малое число целевых файлов не уменьшает риски долговечности и полномочий до уровня простой локальной правки.

Фактические precode gates: K2 PASS, independent design GO в 03.5_ideation_report.md. K1 scanner вернул NOT ESTABLISHED для Python workspace; ручной поиск имени restore_lab.py в integrations/hermes-health совпадений не нашёл. Native K1 PASS и полный native pipeline не заявляются.
