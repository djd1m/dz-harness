# Независимый QE: offline OAuth lab

Дата: 2026-11-09. **Первичный прогон: 16/16 PASS. После исправления найденного дефекта: 17/17 PASS. Итоговый verdict PASS только для ограниченного offline lab.** Проверка проведена отдельным QE-агентом, назначенным lead для review другой моделью. Это review ограниченной синтетической модели, не разрешение deployment.

## Scope и команда

Прочитаны `03.5_ideation_report.md`, ADR с amendments, требования, архитектура, план, `night_oauth_lab.py`, его unit tests и `oauth-lab-README.md`. Код и тесты QE не редактировал. Linux, Python 3.12.3. Только искусственные значения в собственных временных каталогах `/var/tmp`, удалённых по завершении; без сети, реальных auth/PHI, Docker и production paths. Значения токенов не выводились.

```bash
python3 -m unittest discover -s integrations/hermes-health/experiments/tests -p test_night_oauth_lab.py -v
```

Результат первичного прогона: 16 tests, OK; повторного после изменения реализации: 17 tests, OK, без skips. Команда `python` недоступна; документированная команда `python3` работает.

## Q1 — неполная проверка чисел, средняя серьёзность, исправлен

`night_oauth_lab.py:100–101`: `_finite` передаёт произвольный JSON integer в `math.isfinite`. Для `expires = 10**1000` (валидный JSON значительно меньше лимита 16 KiB) возникает `OverflowError`; `get_access` перехватывает только OSError/ValueError/TypeError, и фиксированный `LabRefusal` не возвращается. Аналогичный путь есть для injected clock/margin и нового fake grant.

Воспроизведение: создать обычные private owner/provider, изменить только поле `expires` существующего state на `10**1000`, вызвать `get_access`. Фактический результат: **OverflowError, provider calls=0**. Токен не выдаётся, fail closed сохранён; это дефект обещанных strict validation и fixed error codes, а не обход refresh lock. Требуется безопасно классифицировать слишком большие числа и добавить regression для state, clock/margin и fake grant. Не считать исходные 16 PASS подтверждением этого края.

Lead исправил `_finite`: OverflowError теперь означает False. QE повторно прочитал изменение и выполнил suite: 17/17 PASS. Regression добавлен для huge expiry, clock и margin. Отдельная повторная QE-проверка подтвердила huge initial grant → `fake_grant_required`; huge state expiry → `state_invalid`, calls=0; huge successor expiry → `provider_result_invalid`, calls=1; рестарт после последнего → `uncertain_new_grant_required`, calls=1. **Q1 закрыт; первоначальный HOLD снят.**

## Дополнительные adversarial проверки

Проверки выполнены отдельными inline Python scripts, без изменений реализации или committed tests.

| Проверка | Наблюдаемый результат |
| --- | --- |
| Настоящий patched `os.fsync` бросает OSError после replace pending | Первый вызов `storage_or_durability_unknown`; новый owner `uncertain_new_grant_required`; provider calls=0 |
| `os.fsync` бросает после replace successor state | Первый вызов `storage_or_durability_unknown`; новый owner uncertain; provider calls=1 |
| `os.fsync` бросает после удаления pending | Первый вызов `storage_or_durability_unknown`; новый owner выдаёт generation=1; calls=1 |
| Clock продвинут между первой проверкой и возвратом готового access | `access_expired`, calls=0; просроченный access не выдан |
| Отрицательный контроль: только owner lock заменён в памяти на no-op, два fork worker остановлены barrier после чтения одного state; provider lock сохранён | calls=2, один success, оба процесса завершились штатно; общий ledger действительно видит конфликт |
| Existing state mode 0644 | `state_permissions` |
| FIFO вместо state | `state_permissions`, зависания нет |
| Hardlink на state, link count=2 | `state_permissions` |

Последний fsync-сценарий соответствует принятой поправке ADR: successor уже сохранён, но не подтверждена durability удаления маркера. Возможность generation=1 после рестарта здесь **не дефект**. Persisted uncertain после этого окна и физический power loss не обещаются.

## Оценка покрытия и границы

Штатные тесты подтверждают четыре процесса, threads одного owner и разных objects, конфликт двух копий, persistent ambiguity, консервативный timeout/revoke, отказ после visible replace результата, process death на пяти hook boundaries, symlink refusal, часть malformed JSON, access-only API и отсутствие reset. Весь refresh выполняется под одним owner flock; fd открывается отдельно на операцию. Provider ledger общий и сохраняется при смерти owner.

Название `test_clock_boundary_and_expiry_during_response` шире его фактического содержания: он проверяет точную margin boundary и NaN, но не движение часов во время response. Дополнительная QE-проверка покрыла движение между проверкой и return для ready path. Штатные tests поднимают OSError hook около fsync, а не из fsync; QE отдельно проверил сам вызов. Negative concurrency control не включён в regression suite и не измеряет max_inflight; он доказывает общий provider и значимость owner lock, но не полный набор interleavings. Нет exhaustive crash matrix на всех file-fsync/replace windows, deterministic paused-holder/third-contender и исчерпывающего permission/alias набора из challenge.

Reset/revoke mutation API сознательно отсутствует по ADR amendment: требования ABA/reset здесь неприменимы. Provider revoke моделируется при следующем refresh, не доказывает отзыв уже выданного access. Clock rollback, hostile same-UID writers, NFS и физический power loss вне scope. README явно ограничивает заявления offline toy. Никаких выводов о реальном OAuth, Hermes adapter или Codex refresh-disable сделать нельзя.

Незакрытых блокирующих source defects в проверенном scope не найдено. PASS относится к наблюдаемым сценариям ограниченного offline lab с перечисленными пробелами покрытия, а не ко всем gates исходного challenge или production readiness.
